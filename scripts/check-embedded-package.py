#!/usr/bin/env python3
"""Check the recipient's embedded crate, MSRV, consumer and shared conformance."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tomllib

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'rust/embedded'
TARGET = ROOT / 'rust/target'


def run(*args):
    subprocess.run([str(arg) for arg in args], cwd=ROOT, check=True)


def cargo(toolchain, command, manifest, *args):
    run('cargo', '+' + toolchain, command, '--locked', '--manifest-path', manifest,
        '--target-dir', TARGET, *args)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-dirty', action='store_true', help='local preparation only')
    args = parser.parse_args()
    assert (SOURCE / 'SPEC.md').read_bytes() == (ROOT / 'SPEC.md').read_bytes(), 'refresh bundled SPEC.md'
    assert (SOURCE / 'src/tables.rs').read_bytes() == (ROOT / 'rust/src/tables.rs').read_bytes()
    assert (SOURCE / 'LICENSE').read_bytes() == (ROOT / 'LICENSE').read_bytes()
    metadata = tomllib.loads((SOURCE / 'Cargo.toml').read_text())
    assert metadata['dependencies'] == {} and 'dev-dependencies' not in metadata
    identity = metadata['package']
    assert identity['name'] == 'forgesworn-qr-embedded' and identity['rust-version'] == '1.87'
    # Fetch test-only dependencies before the offline extracted-package checks.
    run('cargo', '+stable', 'fetch', '--locked', '--manifest-path', SOURCE / 'conformance/Cargo.toml')
    extra = ['--allow-dirty'] if args.allow_dirty else []
    cargo('stable', 'package', SOURCE / 'Cargo.toml', *extra)
    name = identity['name'] + '-' + identity['version']
    archive = TARGET / 'package' / (name + '.crate')
    scratch = TARGET / 'embedded-distribution'
    if scratch.exists():
        shutil.rmtree(scratch)
    scratch.mkdir(parents=True)
    expected = {'Cargo.toml', 'Cargo.toml.orig', 'Cargo.lock', 'README.md', 'LICENSE',
                'SPEC.md', 'src/lib.rs', 'src/tables.rs', '.cargo_vcs_info.json'}
    seen = set()
    with tarfile.open(archive) as packed:
        for member in packed.getmembers():
            path = Path(member.name)
            assert path.parts[0] == name and '..' not in path.parts and not path.is_absolute()
            relative = str(Path(*path.parts[1:]))
            assert member.isfile() and relative in expected, f'unexpected package entry: {relative}'
            assert relative not in seen, f'duplicate package entry: {relative}'
            seen.add(relative)
            destination = scratch / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(packed.extractfile(member).read())
    assert expected - {'.cargo_vcs_info.json'} <= seen
    extracted = scratch / name
    manifest = extracted / 'Cargo.toml'
    package = tomllib.loads(manifest.read_text())
    for key in ['dependencies', 'dev-dependencies', 'build-dependencies']:
        assert not package.get(key), f'published package gained {key}'
    for path in ['src/lib.rs', 'src/tables.rs', 'SPEC.md', 'README.md', 'LICENSE']:
        assert (extracted / path).read_bytes() == (SOURCE / path).read_bytes(), path
    graph = json.loads(subprocess.check_output(
        ['cargo', '+stable', 'metadata', '--locked', '--offline', '--format-version', '1',
         '--manifest-path', str(manifest)], cwd=ROOT))
    assert len(graph['packages']) == 1, 'distributed crate must be independent'
    for features in [[], ['--all-features']]:
        cargo('1.87.0', 'test', manifest, '--offline', *features)
    cargo('stable', 'clippy', manifest, '--offline', '--all-targets', '--all-features', '--', '-Dwarnings')
    run('env', 'RUSTDOCFLAGS=-Dwarnings', 'cargo', '+stable', 'doc', '--locked', '--offline',
        '--manifest-path', manifest, '--target-dir', TARGET, '--all-features', '--no-deps')

    # Execute the same repository tests against the actual extracted library.
    harness = scratch / 'conformance'
    harness.mkdir()
    source_harness = SOURCE / 'conformance'
    text = (source_harness / 'Cargo.toml').read_text()
    text = text.replace('path = "..",', 'path = ' + json.dumps(str(extracted)) + ',')
    text = text.replace('path = "../.."', 'path = ' + json.dumps(str(ROOT / 'rust')))
    text = text.replace('path = "../tests/', 'path = "' + str(SOURCE / 'tests') + '/')
    text = text.replace('path = "../examples/', 'path = "' + str(SOURCE / 'examples') + '/')
    (harness / 'Cargo.toml').write_text(text)
    (harness / 'src').mkdir()
    shutil.copyfile(source_harness / 'src/lib.rs', harness / 'src/lib.rs')
    shutil.copyfile(source_harness / 'Cargo.lock', harness / 'Cargo.lock')
    for features in [[], ['--all-features']]:
        cargo('stable', 'test', harness / 'Cargo.toml', '--offline', '--release', *features, '--', '--nocapture')

    # A no_std consumer has no repository paths, test oracles or allocator.
    consumer = scratch / 'consumer'
    (consumer / 'src').mkdir(parents=True)
    (consumer / 'Cargo.toml').write_text(
        '[package]\nname="embedded-package-consumer"\nversion="0.0.0"\nedition="2021"\n'
        '[features]\noptimal=["forgesworn-qr-embedded/optimal"]\n'
        '[dependencies]\nforgesworn-qr-embedded={path=' + json.dumps(str(extracted)) + '}\n')
    (consumer / 'src/lib.rs').write_text('''#![no_std]
use forgesworn_qr_embedded::{encode_bytes, Options, Workspace, MODULE_BYTES};
pub fn raw() -> usize {
    let mut scratch = Workspace::new();
    let mut output = [0; MODULE_BYTES];
    let code = encode_bytes(&[0xab; 32], &Options::default(), &mut scratch, &mut output).unwrap();
    code.size()
}
#[cfg(feature = "optimal")]
pub fn text() -> usize {
    use forgesworn_qr_embedded::{encode_text, TextPlanner};
    let mut scratch = Workspace::new();
    let mut output = [0; MODULE_BYTES];
    let mut planner = TextPlanner::new();
    let code = encode_text("TEST123456789012345", &Options::default(), &mut planner, &mut scratch, &mut output).unwrap();
    code.size()
}
''')
    run('cargo', '+1.87.0', 'generate-lockfile', '--offline', '--manifest-path', consumer / 'Cargo.toml')
    for features in [[], ['--all-features']]:
        cargo('1.87.0', 'check', consumer / 'Cargo.toml', '--offline', *features)
    verified = TARGET / 'embedded-verified'
    verified.mkdir(exist_ok=True)
    shutil.copyfile(archive, verified / archive.name)
    (verified / 'checks.json').write_text(json.dumps({
        'package': identity['name'], 'version': identity['version'],
        'archive_sha256_base64': base64.b64encode(hashlib.sha256(archive.read_bytes()).digest()).decode(),
        'checks': ['dependency-free archive', 'Rust 1.87 default and optimal unit/doc tests',
                   'strict Clippy and rustdoc', 'shared conformance default and optimal', 'no_std consumer'],
        'shared_zxing_vectors': 82, 'physical_device_tested': False,
    }, indent=2) + '\n')
    print('Embedded package verified: no dependencies, Rust 1.87, both APIs, shared conformance and no_std consumer')


if __name__ == '__main__':
    main()
