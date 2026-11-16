"""Capture Deno's actual publishing archive on loopback; never contact a registry.

Deno's dry-run does not expose the transformed archive. This fixture verifies
that its publish-time rewriting leaves the caller-instantiated WASM unchanged.
"""
import argparse
import hashlib
import http.server
import io
import json
import os
import subprocess
import tarfile
import threading
import urllib.parse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--stage", required=True, type=Path)
parser.add_argument("--deno", default="deno")
args = parser.parse_args()
stage = args.stage.resolve()
receipt = json.loads((stage / ".stage-manifest.json").read_text())
package_path = "/api/scopes/forgesworn/packages/qr"
version_path = package_path + "/versions/" + receipt["version"]
uploads = []
unexpected = []


class Fixture(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == package_path:
            self.respond(200, {})
        elif self.path == version_path:
            self.respond(404, {"code": "notFound", "message": "Fixture version not published"})
        else:
            unexpected.append(self.path)
            self.respond(400, {"code": "unexpected", "message": "Unexpected fixture route"})

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        if (url.path != version_path or urllib.parse.parse_qs(url.query) != {"config": ["/jsr.json"]}
                or not 0 < length <= 5_000_000 or uploads):
            unexpected.append(self.path)
            self.respond(400, {"code": "unexpected", "message": "Unexpected fixture upload"})
            return
        uploads.append(self.rfile.read(length))
        self.respond(200, {"id": "fixture", "status": "success", "error": None})


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    env = {**os.environ, "JSR_URL": f"http://127.0.0.1:{server.server_port}/"}
    result = subprocess.run([args.deno, "publish", "--sloppy-imports", "--token", "fixture-only",
                             "--no-provenance"], cwd=stage, env=env, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout + result.stderr
    assert not unexpected, unexpected
    assert len(uploads) == 1, "Expected exactly one local archive upload"
    with tarfile.open(fileobj=io.BytesIO(uploads[0]), mode="r:gz") as archive:
        members = {entry.name.removeprefix("./"): entry for entry in archive.getmembers()}
        binary = archive.extractfile(members["src/qr.bin"]).read()
        assert hashlib.sha256(binary).hexdigest() == receipt["wasmSha256"], "Publisher changed WASM bytes"
        assert binary == (stage / "src/qr.bin").read_bytes()
        adapter = archive.extractfile(members["src/wasm.ts"]).read().decode()
        assert "new URL('./qr.bin', import.meta.url)" in adapter
        assert not any(name.endswith(".wasm") for name in archive.getnames())
    print(json.dumps({"localUploadCapture": True, "version": receipt["version"],
                      "wasmBytes": len(binary), "wasmSha256": receipt["wasmSha256"]}))
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
