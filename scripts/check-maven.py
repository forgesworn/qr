"""Check the staged Maven artefacts, then consume them only through Maven resolution."""
import hashlib
import json
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "package.json").read_text())["version"]
staging = root / "kotlin/build/staging-deploy"
folder = staging / "io/github/forgesworn/qr" / version
stem = f"qr-{version}"
ns = {"m": "http://maven.apache.org/POM/4.0.0"}
pom = ET.parse(folder / f"{stem}.pom").getroot()
assert pom.findtext("m:groupId", namespaces=ns) == "io.github.forgesworn"
assert pom.findtext("m:artifactId", namespaces=ns) == "qr"
assert pom.findtext("m:version", namespaces=ns) == version
for field in ["name", "description", "url", "licenses/license/name", "developers/developer/id", "scm/connection"]:
    assert pom.findtext("/".join("m:" + part for part in field.split("/")), namespaces=ns), field
actual = [(dep.findtext("m:groupId", namespaces=ns), dep.findtext("m:artifactId", namespaces=ns))
          for dep in pom.findall("m:dependencies/m:dependency", ns)]
assert actual == [("org.jetbrains.kotlin", "kotlin-stdlib")], actual
licence = (root / "LICENSE").read_bytes()
for suffix in ["", "-sources", "-javadoc"]:
    with zipfile.ZipFile(folder / f"{stem}{suffix}.jar") as jar:
        assert jar.read("META-INF/LICENSE") == licence
        names = jar.namelist()
        if suffix == "":
            classes = [n for n in names if n.endswith(".class")]
            assert classes and all(n.startswith("dev/forgesworn/qr/") for n in classes)
            assert all(int.from_bytes(jar.read(n)[6:8], "big") == 61 for n in classes)
        elif suffix == "-sources":
            for source in (root / "kotlin/core/src/main/kotlin").rglob("*.kt"):
                assert jar.read(str(source.relative_to(root / "kotlin/core/src/main/kotlin"))) == source.read_bytes()
        else:
            assert "index.html" in names
            assert "core/dev.forgesworn.qr/encode.html" in names, "Missing Kotlin API documentation"
            assert not {"stylesheet.css", "resources/glass.png", "resources/x.png"}.intersection(names)
            javadoc = root / "kotlin/core/src/javadoc"
            notices = javadoc / "notices"
            for filename in ["DOKKA-LICENSE.txt", "DOKKA-NOTICE.txt", "DOKKA-HTML-LICENSES.txt", "README.md"]:
                assert jar.read(f"META-INF/third-party/{filename}") == (notices / filename).read_bytes(), filename
            for line in (javadoc / "dokka-assets.sha256").read_text().splitlines():
                digest, filename = line.split()
                assert hashlib.sha256(jar.read(filename)).hexdigest() == digest, f"Audited Dokka asset changed: {filename}"
for path in folder.iterdir():
    for algorithm in ["md5", "sha1", "sha256", "sha512"]:
        checksum = Path(str(path) + "." + algorithm)
        if checksum.is_file():
            assert checksum.read_text().strip() == hashlib.new(algorithm, path.read_bytes()).hexdigest(), checksum
subprocess.run([str(root / "kotlin/gradlew"), "--project-dir", str(root / "kotlin/consumer"),
                "--no-daemon", "--max-workers=2", "--console=plain", "run", f"-PqrVersion={version}",
                f"-PqrRepository={staging.as_uri()}"], check=True)
print(json.dumps({"coordinate": f"io.github.forgesworn:qr:{version}", "consumer": True,
                  "sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir()
                             if p.suffix in {".jar", ".pom", ".module"}}}, sort_keys=True))
