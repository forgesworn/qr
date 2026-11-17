#!/usr/bin/env python3
"""Prepare a new private reproduction directory; does not run builds or decoders."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

BASELINE = 'b1d95074fb442d87004be1c8bd22b8d8e5c8646f'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    if len(sys.argv) != 6:
        raise SystemExit('Usage: python3 bootstrap.py ARCHIVE BASELINE_CHECKOUT CANDIDATE_CHECKOUT RIVALS NEW_REPLAY_DIR')
    archive, baseline, candidate, rivals, replay = map(lambda v: Path(v).resolve(), sys.argv[1:])
    if replay.exists() or any(replay == p or p in replay.parents for p in [archive, baseline, candidate, rivals]):
        raise ValueError('Replay directory must be new and outside all input trees')
    git = lambda *args: subprocess.check_output(['git', '-C', str(baseline), *args]).decode().strip()
    if git('rev-parse', 'HEAD') != BASELINE or git('status', '--porcelain', '--untracked-files=no'):
        raise ValueError('Baseline must be a clean tracked checkout at the exact revision')
    source_manifest = json.loads((archive / 'prototype-sources.json').read_text())
    source_dir = candidate / 'src'
    if sorted(p.name for p in source_dir.glob('*.ts')) != sorted(source_manifest):
        raise ValueError('Candidate source module set differs')
    for name, expected in source_manifest.items():
        if sha(source_dir / name) != expected:
            raise ValueError('Candidate source hash differs: ' + name)
    receipt_path = baseline / 'benchmarks/2026-11-17-m4/selected-mesh-recovery/production-qualified.json'
    receipt = json.loads(receipt_path.read_text())
    if not receipt.get('passed'):
        raise ValueError('Baseline qualification has not passed')
    for dirname, key, suffix in [('src', 'sources', '.ts'), ('dist', 'generated', '.js')]:
        expected = receipt['identity'][key]['public']
        directory = baseline / dirname
        filenames = sorted(name[:-3] + suffix for name in expected)
        if sorted(p.name for p in directory.glob('*' + suffix)) != filenames:
            raise ValueError('Baseline ' + dirname + ' module set differs')
        for name, digest in expected.items():
            if sha(directory / (name[:-3] + suffix)) != digest:
                raise ValueError('Baseline ' + dirname + ' hash differs: ' + name)
    if not (rivals / 'package.json').is_file():
        raise ValueError('Rivals must be an existing locked installation')
    helpers = ['build-prototype.cjs', 'prepare-png.cjs', 'verify-prototype.mjs',
               'qualify-prototype.mjs', 'regression-prototype.mjs', 'corpora.mjs',
               'validation-frames.mjs', 'validation-declaration.json', 'validation-manifest.json',
               'prototype-sources.json']
    originals = ['qualification.json', 'regression.json', 'functional.json', 'integration-files.json']
    for name in helpers + originals:
        if not (archive / name).is_file():
            raise ValueError('Archive file missing: ' + name)
    replay.mkdir(parents=True)
    for name in helpers:
        shutil.copyfile(archive / name, replay / name)
        if sha(archive / name) != sha(replay / name):
            raise ValueError('Copied helper differs: ' + name)
    (replay / 'original').mkdir()
    for name in originals:
        shutil.copyfile(archive / name, replay / 'original' / name)
        if sha(archive / name) != sha(replay / 'original' / name):
            raise ValueError('Copied receipt differs: ' + name)
    target_source = replay / 'prototype-source'
    target_source.mkdir()
    for name, expected in source_manifest.items():
        shutil.copyfile(source_dir / name, target_source / name)
        if sha(target_source / name) != expected:
            raise ValueError('Copied candidate source differs: ' + name)
    (target_source / 'package.json').write_text('{"type":"module"}\n')
    (replay / 'rivals').symlink_to(rivals, target_is_directory=True)
    binding = {'baseline': BASELINE, 'candidateSourceManifestSha256': sha(replay / 'prototype-sources.json'),
               'sourceFiles': source_manifest, 'baselineReceiptSha256': sha(receipt_path),
               'helpers': {name: sha(replay / name) for name in helpers},
               'originalReceipts': {name: sha(replay / 'original' / name) for name in originals},
               'rivalsPath': str(rivals)}
    (replay / 'bootstrap-binding.json').write_text(json.dumps(binding, indent=2) + '\n')
    print('Prepared new replay directory:', replay)

if __name__ == '__main__':
    main()
