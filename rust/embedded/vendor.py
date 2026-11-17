#!/usr/bin/env python3
"""Export an exact, dependency-free runtime snapshot for an embedded consumer."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import tomllib

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[1]


def snapshot():
    manifest = (SOURCE / 'Cargo.toml').read_text()
    metadata = tomllib.loads(manifest)
    assert metadata['dependencies'] == {}, 'review new runtime dependencies before vendoring'
    assert 'dev-dependencies' not in metadata, 'keep test oracles in the conformance harness'
    assert (SOURCE / 'SPEC.md').read_bytes() == (ROOT / 'SPEC.md').read_bytes(), 'refresh bundled SPEC.md'
    # The consumer chooses its own release profile; local snapshots cannot publish.
    manifest = manifest.split('[profile.release]')[0].rstrip() + '\n'
    manifest = manifest.replace('[package]\n', '[package]\npublish = false\n', 1)
    readme = (SOURCE / 'README.md').read_text()
    readme = ('> Vendored runtime snapshot. Development and comparison commands below\n'
              '> refer to the upstream QR repository. See VENDORED.json for exact source hashes.\n\n'
              + readme.replace('(../../SPEC.md)', '(SPEC.md)'))
    files = {'Cargo.toml': manifest.encode(), 'README.md': readme.encode(),
             'LICENSE': (SOURCE / 'LICENSE').read_bytes(),
             'SPEC.md': (SOURCE / 'SPEC.md').read_bytes(),
             'src/lib.rs': (SOURCE / 'src/lib.rs').read_bytes(),
             'src/tables.rs': (SOURCE / 'src/tables.rs').read_bytes()}
    revision = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    dirty = bool(subprocess.check_output(['git', '-C', str(ROOT), 'status', '--porcelain'], text=True))
    provenance = {'repository': 'https://github.com/forgesworn/qr',
                  'base_commit': revision, 'source_has_local_changes': dirty,
                  'package': metadata['package']['name'], 'version': metadata['package']['version'],
                  'exporter_sha256_base64': base64.b64encode(hashlib.sha256(Path(__file__).read_bytes()).digest()).decode(),
                  'files_sha256_base64': {name: base64.b64encode(hashlib.sha256(data).digest()).decode()
                                         for name, data in files.items()},
                  'transformations': ['Disable publication of the local snapshot and omit the release profile',
                                      'Prefix README with snapshot context and localise its SPEC link']}
    files['VENDORED.json'] = (json.dumps(provenance, indent=2) + '\n').encode()
    return files


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    for name, data in snapshot().items():
        path = args.destination / name
        if args.check:
            if not path.is_file() or path.read_bytes() != data:
                raise SystemExit(f'Stale vendored file: {path}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print(('Verified' if args.check else 'Exported') + f' runtime snapshot: {args.destination}')
