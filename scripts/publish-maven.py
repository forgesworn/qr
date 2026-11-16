"""Bundle staged Maven artefacts; explicitly publish via the Central Portal API.

Protocol: https://central.sonatype.org/publish/publish-portal-api/
No upload or publication request is retried. Keep the receipt on failure and
inspect the recorded deployment in Central before deciding whether to rerun.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
API = "https://central.sonatype.com/api/v1/publisher/"
ALGORITHMS = ("md5", "sha1", "sha256", "sha512")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("Central returned a redirect; refusing to forward credentials")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--publish", action="store_true", help="Upload, validate and publish once")
    mode.add_argument("--dry-run", action="store_true", help="Build an unsigned bundle only (default)")
    args = parser.parse_args()
    version = json.loads((ROOT / "package.json").read_text())["version"]
    if not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version):
        raise RuntimeError("Expected a stable package version")
    relative = Path("io/github/forgesworn/qr") / version
    folder = ROOT / "kotlin/build/staging-deploy" / relative
    output = ROOT / "kotlin/build/central-publication"
    output.mkdir(parents=True, exist_ok=True)
    receipt_path = output / "receipt.json"
    # Prevent reruns in the same staging directory from overwriting a deployment
    # identity, including one whose upload response was lost.
    if receipt_path.exists():
        previous = json.loads(receipt_path.read_text())
        if previous.get("uploadAttempted"):
            raise RuntimeError("A previous upload receipt exists; inspect Central and retain it before any new attempt")
    stem = f"qr-{version}"
    payloads = {stem + suffix for suffix in (".jar", "-sources.jar", "-javadoc.jar", ".pom", ".module")}
    ns = {"m": "http://maven.apache.org/POM/4.0.0"}
    pom = ET.parse(folder / f"{stem}.pom").getroot()
    for key, expected in (("groupId", "io.github.forgesworn"), ("artifactId", "qr"), ("version", version)):
        if pom.findtext("m:" + key, namespaces=ns) != expected:
            raise RuntimeError(f"POM {key} does not match the release")
    files = {}
    for path in sorted(folder.iterdir()):
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(f"Not a regular staged file: {path.name}")
        name = path.name
        for algorithm in ALGORITHMS:
            if name.endswith("." + algorithm):
                name = name[:-(len(algorithm) + 1)]
                expected = hashlib.new(algorithm, (folder / name).read_bytes()).hexdigest()
                if path.read_text().strip() != expected:
                    raise RuntimeError(f"Invalid staged checksum: {path.name}")
                break
        base = name.removesuffix(".asc")
        if base not in payloads:
            raise RuntimeError(f"Unexpected staged file: {path.name}")
        if path.name == name:
            files[name] = path.read_bytes()
    if not payloads.issubset(files):
        raise RuntimeError("Missing binary, sources, API documentation, POM or Gradle metadata")
    if args.publish:
        for variable in ("CENTRAL_USERNAME", "CENTRAL_PASSWORD"):
            if not os.environ.get(variable):
                raise RuntimeError(f"Required environment variable is missing: {variable}")
        home = os.environ.get("GNUPGHOME")
        if not home or not Path(home).is_dir():
            raise RuntimeError("GNUPGHOME must contain the isolated, imported release public key")
        for name in sorted(payloads):
            signature = name + ".asc"
            if signature not in files:
                raise RuntimeError(f"Missing detached signature: {signature}")
            verified = subprocess.run(["gpg", "--batch", "--no-auto-key-retrieve", "--homedir", home,
                                       "--verify", str(folder / signature), str(folder / name)],
                                      capture_output=True, timeout=30)
            if verified.returncode:
                raise RuntimeError(f"Detached signature verification failed: {signature}")
    elif any(name.endswith(".asc") for name in files):
        raise RuntimeError("Dry-run expects unsigned staging; do not supply signing secrets")

    # Include checksums for signatures too, independent of Gradle's sidecar set.
    for name, content in list(files.items()):
        for algorithm in ALGORITHMS:
            files[name + "." + algorithm] = hashlib.new(algorithm, content).hexdigest().encode() + b"\n"
    bundle = output / f"forgesworn-qr-{version}.zip"
    with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in sorted(files.items()):
            info = zipfile.ZipInfo((relative / name).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content)
    receipt = {"coordinate": f"io.github.forgesworn:qr:{version}", "publishingType": "USER_MANAGED",
               "dryRun": not args.publish, "uploadAttempted": False,
               "bundleSha256": hashlib.sha256(bundle.read_bytes()).hexdigest(),
               "files": {str(relative / name): hashlib.sha256(content).hexdigest() for name, content in sorted(files.items())}}

    def save(state, **details):
        receipt.update(state=state, **details)
        temporary = receipt_path.with_suffix(".tmp")
        with temporary.open("w") as file:
            json.dump(receipt, file, indent=2, sort_keys=True)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        temporary.replace(receipt_path)
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as file:
                file.write(f"deployment_state={state}\n")
        print(json.dumps({"state": state, "deploymentId": receipt.get("deploymentId"),
                          "coordinate": receipt["coordinate"]}), flush=True)

    save("BUNDLED")
    if not args.publish:
        return
    username, password = os.environ["CENTRAL_USERNAME"], os.environ["CENTRAL_PASSWORD"]
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    opener = urllib.request.build_opener(NoRedirect())

    def request(endpoint, data=b"", content_type="application/json"):
        req = urllib.request.Request(API + endpoint, data=data, method="POST", headers={
            "Authorization": "Bearer " + token, "Content-Type": content_type, "Accept": "application/json, text/plain"})
        try:
            with opener.open(req, timeout=60) as response:
                body = response.read(1_048_577)
                if len(body) > 1_048_576:
                    raise RuntimeError("Central response exceeded the bounded response size")
                return response.status, body
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Central HTTP {error.code}; inspect the retained deployment receipt") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise RuntimeError("Central transport failed; inspect the receipt before retrying any mutation") from None

    boundary = "qr-" + uuid.uuid4().hex
    multipart = (f'--{boundary}\r\nContent-Disposition: form-data; name="bundle"; filename="{bundle.name}"\r\n'
                 'Content-Type: application/octet-stream\r\n\r\n').encode() + bundle.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    save("UPLOADING", uploadAttempted=True)
    try:
        code, body = request("upload?" + urllib.parse.urlencode({"name": f"forgesworn-qr-{version}", "publishingType": "USER_MANAGED"}),
                             multipart, "multipart/form-data; boundary=" + boundary)
        if code != 201:
            raise RuntimeError("Unexpected upload response; no automatic reupload")
        deployment = str(uuid.UUID(body.decode().strip()))
    except Exception:
        save("UPLOAD_UNCONFIRMED")
        raise
    save("UPLOADED", deploymentId=deployment)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as file:
            file.write(f"deployment_id={deployment}\n")

    def poll(target):
        deadline = time.monotonic() + 15 * 60
        while time.monotonic() < deadline:
            code, body = request("status?" + urllib.parse.urlencode({"id": deployment}))
            if code != 200:
                raise RuntimeError("Unexpected status response")
            status = json.loads(body)
            if status.get("deploymentId") != deployment:
                raise RuntimeError("Central returned a different deployment identity")
            state = status.get("deploymentState")
            if state not in {"PENDING", "VALIDATING", "VALIDATED", "PUBLISHING", "PUBLISHED", "FAILED"}:
                raise RuntimeError("Central returned an unknown deployment state")
            # Status responses can include server validation details. Never retain
            # credentials even if a service unexpectedly echoes one in an error.
            sanitised = json.dumps(status)
            for secret in (token, password, username):
                sanitised = sanitised.replace(secret, "[redacted]")
            with (output / "status.jsonl").open("a") as file:
                file.write(sanitised + "\n"); file.flush(); os.fsync(file.fileno())
            save(state)
            if state == "FAILED":
                raise RuntimeError("Central validation failed; inspect status.jsonl and the deployment in Portal")
            if state == target:
                return
            if target == "VALIDATED" and state in {"PUBLISHING", "PUBLISHED"}:
                raise RuntimeError("USER_MANAGED deployment published unexpectedly; inspect Portal")
            time.sleep(min(10, max(0, deadline - time.monotonic())))
        raise RuntimeError(f"Timed out waiting for {target}; retain deployment {deployment} and inspect Portal")

    poll("VALIDATED")
    save("PUBLISH_REQUESTING")
    try:
        code, _ = request("deployment/" + deployment)
        if code != 204:
            raise RuntimeError("Unexpected publication response")
    except Exception:
        save("PUBLISH_UNCONFIRMED")
        raise
    save("PUBLISH_REQUESTED")
    poll("PUBLISHED")
    print("Central reports PUBLISHED; public repository availability and consumer verification remain separate gates.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Maven publication stopped: {error}", file=sys.stderr)
        sys.exit(1)
