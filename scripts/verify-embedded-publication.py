#!/usr/bin/env python3
"""Read back one published embedded crate; never uploads or retries publication."""
import hashlib
import json
from pathlib import Path
import subprocess
import time
import tomllib
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / 'rust/target'


def main():
    package = tomllib.loads((ROOT / 'rust/embedded/Cargo.toml').read_text())['package']
    name, version = package['name'], package['version']
    filename = f'{name}-{version}.crate'
    expected = (TARGET / 'embedded-verified' / filename).read_bytes()
    url = f'https://static.crates.io/crates/{name}/{filename}'
    for attempt in range(12):
        try:
            with urlopen(url, timeout=30) as response:
                public = response.read()
            break
        except (HTTPError, URLError) as error:
            if isinstance(error, HTTPError) and error.code not in [403, 404, 429] and error.code < 500:
                raise
            if attempt == 11:
                raise RuntimeError('Public readback unavailable; inspect registry state before any publication retry') from error
            time.sleep(10)
    assert public == expected, 'public archive differs from the verified pre-publication archive'
    consumer = TARGET / 'embedded-registry-consumer'
    (consumer / 'src').mkdir(parents=True, exist_ok=True)
    (consumer / 'Cargo.toml').write_text(
        '[package]\nname="embedded-registry-consumer"\nversion="0.0.0"\nedition="2021"\n'
        '[features]\noptimal=["forgesworn-qr-embedded/optimal"]\n'
        '[dependencies]\nforgesworn-qr-embedded="=' + version + '"\n')
    fixture = TARGET / 'embedded-distribution/consumer/src/lib.rs'
    (consumer / 'src/lib.rs').write_bytes(fixture.read_bytes())
    for features in [[], ['--all-features']]:
        subprocess.run(['cargo', '+1.87.0', 'check', '--manifest-path', str(consumer / 'Cargo.toml'),
                        '--target-dir', str(TARGET), *features], cwd=ROOT, check=True)
    lock = tomllib.loads((consumer / 'Cargo.lock').read_text())['package']
    entry = next(p for p in lock if p['name'] == name)
    assert entry['version'] == version and entry['source'].startswith('registry+')
    assert entry['checksum'] == hashlib.sha256(expected).hexdigest()
    (consumer / 'receipt.json').write_text(json.dumps({
        'package': name, 'version': version, 'public_archive_matches_verified': True,
        'registry_consumer_default_and_optimal': True,
    }, indent=2) + '\n')
    print(f'Public {name} {version} matches the verified archive and passes both registry consumers')


if __name__ == '__main__':
    main()
