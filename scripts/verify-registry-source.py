"""Bind a new registry's packaging to the library code in an existing release."""
import json
import re
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
tag, registry = sys.argv[1:]
assert re.fullmatch(r"v\d+\.\d+\.\d+", tag), "Expected a stable release tag"
assert registry in {"jsr", "maven"}
package = json.loads((root / "package.json").read_text())
assert package["version"] == tag[1:], "Package version does not match release"
ref = f"refs/tags/{tag}"
subprocess.run(["git", "rev-parse", "--verify", f"{ref}^{{commit}}"], cwd=root, check=True)
release = json.loads(subprocess.check_output([
    "gh", "release", "view", tag, "--repo", "forgesworn/qr", "--json", "isDraft,isPrerelease"
]))
assert not release["isDraft"] and not release["isPrerelease"]
paths = ["src", "wasm/qr.wasm", "wasm/manifest.json"] if registry == "jsr" else ["kotlin/core/src/main"]
subprocess.run(["git", "diff", "--exit-code", ref, "HEAD", "--", *paths], cwd=root, check=True)
print(f"{registry}: library sources match {tag}; packaging is from this workflow revision")
