"""Read back signed artefacts from Maven Central, then run a registry consumer.

This command never publishes. It can be rerun after delayed public availability
using the retained central-publication receipt from the publishing workflow.
"""
import hashlib
import json
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output = root / "kotlin/build/central-publication"
receipt = json.loads((output / "receipt.json").read_text())
assert receipt["state"] == "PUBLISHED", "Central has not confirmed publication"
version = json.loads((root / "package.json").read_text())["version"]
assert receipt["coordinate"] == f"io.github.forgesworn:qr:{version}"
base = "https://repo.maven.apache.org/maven2/"
pending = {name: digest for name, digest in receipt["files"].items()
           if name.endswith((".jar", ".pom", ".module", ".asc"))}
assert len(pending) == 10, "Expected five artefacts and their detached signatures"
verified = {}
deadline = time.monotonic() + 20 * 60
while pending:
    for name, digest in list(pending.items()):
        try:
            request = urllib.request.Request(base + name, headers={"User-Agent": "ForgeSworn-QR-release/1.0"})
            with urllib.request.urlopen(request, timeout=30) as response:
                content = response.read(20_000_001)
                assert len(content) <= 20_000_000, "Unexpectedly large public artefact"
        except urllib.error.HTTPError as error:
            if error.code in {404, 429, 500, 502, 503, 504}:
                continue
            raise
        assert hashlib.sha256(content).hexdigest() == digest, f"Published bytes differ: {name}"
        verified[name] = digest
        del pending[name]
    if pending:
        assert time.monotonic() < deadline, "Public artefacts still unavailable; investigate without republishing"
        print(f"Waiting for {len(pending)} public Maven artefacts", flush=True)
        time.sleep(30)

# Resolve the public repository explicitly and refresh dependency metadata. The
# consumer is a separate Gradle project with no project dependency on the core.
subprocess.run([str(root / "kotlin/gradlew"), "--project-dir", str(root / "kotlin/consumer"),
                "--no-daemon", "--max-workers=2", "--console=plain", "--refresh-dependencies",
                "run", f"-PqrVersion={version}", f"-PqrRepository={base}"], check=True)
result = {"coordinate": receipt["coordinate"], "deploymentId": receipt["deploymentId"],
          "repository": base, "consumer": True, "sha256": verified}
(output / "public-verification.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
print(json.dumps(result, sort_keys=True))
