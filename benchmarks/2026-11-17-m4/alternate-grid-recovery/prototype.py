#!/usr/bin/env python3
"""Copy the exact 0.3.10 source and add bounded alternate-grid recovery.
Usage: python3 prototype.py ROOT EXACT_BASELINE_COMMIT NEW_OUTSRC
Only source files are copied/patched. No compilation or decoder execution.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    root = Path(sys.argv[1]).resolve()
    revision = sys.argv[2]
    dest = Path(sys.argv[3]).resolve()
    source = root / 'src'
    if not re.fullmatch('[0-9a-f]{40}', revision):
        raise ValueError('Supply an exact 40-character baseline commit')
    if revision != '8360eb3b648ebc1d9439684a9f643cc1fb162713':
        raise ValueError('Expected the released 0.3.10 baseline')
    if subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() != revision:
        raise ValueError('Checkout HEAD differs from supplied baseline')
    if dest.exists() or dest == source or source in dest.parents:
        raise ValueError('Destination must be new and outside ROOT/src')
    expected_path = Path(__file__).with_name('expected-sources.json')
    expected = json.loads(expected_path.read_text())
    files = {str(p.relative_to(source)): p.read_bytes() for p in sorted(source.rglob('*')) if p.is_file()}
    if {name: sha(data) for name, data in files.items()} != expected:
        raise ValueError('Source differs from frozen 0.3.10 source')
    for name, data in files.items():
        if subprocess.check_output(['git', '-C', str(root), 'show', revision + ':src/' + name]) != data:
            raise ValueError('Uncommitted source: ' + name)
    replacements = []
    text = files['decode.ts'].decode()

    def replace(old, new, count=1):
        nonlocal text
        if text.count(old) != count:
            raise ValueError(f'Expected {count} matches, found {text.count(old)}: {old[:140]!r}')
        text = text.replace(old, new)
        replacements.append({'file': 'decode.ts', 'needle': old, 'count': count})

    replace('    inverseCurvature = []\n', '    inverseCurvature = []\n    budget.alternateInverse = inverseCurvature\n')
    replace('  return recoverVersionPeer(luminance, inverse, budget, work)\n}',
            '  const versionPeer = recoverVersionPeer(luminance, inverse, budget, work)\n  if (versionPeer) return versionPeer\n  return recoverAlternateGrid(budget)\n}')
    replace('  meshGrids: MeshGrid[]\n', '  meshGrids: MeshGrid[]\n  alternateInverse?: Candidate[]\n  alternateGrid?: AlternateGrid\n')
    replace('secondLook(luminance, levels, candidate, work, true, true, meshCollector(budget, candidate, 1, publicInverse))',
            'alternateSecondLook(budget, publicInverse, luminance, levels, candidate, work, true, true, meshCollector(budget, candidate, 1, publicInverse))')
    replace('secondLook(image, thresholds(image), candidate, work, true, true,',
            'alternateSecondLook(budget, inverseLuminance, image, thresholds(image), candidate, work, true, true,', 4)
    text += '\n' + HELPER
    refine = files['refine.ts'].decode()
    old = 'collectMesh?: (modules: Uint8Array) => void): Payload | undefined {'
    if refine.count(old) != 1:
        raise ValueError('Unexpected secondLook signature')
    refine = refine.replace(old, 'collectMesh?: (modules: Uint8Array) => void, collectFinal?: (modules: Uint8Array) => void): Payload | undefined {')
    replacements.append({'file': 'refine.ts', 'needle': old, 'count': 1})
    old = '  // Keep this intermediate only after the final-stage read failed.\n'
    if refine.count(old) != 1:
        raise ValueError('Unexpected failed-read capture site')
    refine = refine.replace(old, '  if (collectFinal) collectFinal(modules)\n' + old)
    replacements.append({'file': 'refine.ts', 'needle': old, 'count': 1})
    for name, data in files.items():
        if (source / name).read_bytes() != data:
            raise ValueError('Source changed while copying: ' + name)
    dest.mkdir(parents=True)
    for name, data in files.items():
        out = dest / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(text.encode() if name == 'decode.ts' else refine.encode() if name == 'refine.ts' else data)
    identity = {'revision': revision, 'prototypeSha256': sha(Path(__file__).read_bytes()),
                'expectedSourcesSha256': sha(expected_path.read_bytes()), 'sourceFiles': expected,
                'copiedFiles': {name: sha((dest / name).read_bytes()) for name in files},
                'replacements': replacements, 'policy': 'first-at-capture alternate; final late-skip; no backfill',
                'bounds': {'second': 8, 'maps': 720, 'alignmentProbes': 11500000,
                           'extraSymbolReads': 2, 'extraImageSamples': 0,
                           'savedPairModuleBytes': 62658, 'conservativeRetainedModuleBytes': 219303}}
    (dest / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    print(json.dumps({'source': str(dest), 'identity': str(dest / 'identity.json')}))


HELPER = r'''
interface AlternateGrid {
  candidate: Candidate
  inverseLuminance: boolean
  final: Uint8Array
  mesh?: Uint8Array
  lateAttempted: boolean
}

/** Refinement geometry excludes the orientation and format hypothesis. */
function sameAlternateGeometry(a: Candidate, b: Candidate): boolean {
  const left = a.location.matrix, right = b.location.matrix
  return a.location.size === b.location.size && a.inverted === b.inverted &&
    !!left && !!right && left.length === right.length &&
    left.every((value, i) => Number.isFinite(value) && value === right[i])
}

function sameAlternateHypothesis(a: Candidate, b: Candidate): boolean {
  return a.mirrored === b.mirrored && a.ecc === b.ecc && a.mask === b.mask
}

/** Keep only the first eligible failed late grid; later invalidation never backfills. */
function alternateSecondLook(budget: Budget, inverseLuminance: boolean,
  ...args: Parameters<typeof secondLook>): Payload | undefined {
  const candidate = args[2], pending = budget.alternateGrid
  // Every full-size late call goes through here, including the eighth call
  // which is deliberately absent from the earlier seven-attempt ledger.
  if (pending && pending.inverseLuminance === inverseLuminance &&
    sameAlternateGeometry(pending.candidate, candidate) &&
    sameAlternateHypothesis(pending.candidate, candidate)) pending.lateAttempted = true
  if (pending) return secondLook(...args)
  let selected: AlternateGrid | undefined
  const collectMesh = args[6]
  // Wrap only an existing collector: never introduce new mesh sampling.
  if (collectMesh) args[6] = modules => {
    collectMesh(modules)
    if (selected) selected.mesh = modules
  }
  args[7] = modules => {
    for (const inverse of [false, true]) {
      if (inverse !== inverseLuminance) continue
      const candidates = inverse ? budget.alternateInverse : budget.curvature
      if (!candidates) continue
      for (const alternative of candidates) {
        if (!sameAlternateGeometry(candidate, alternative) || sameAlternateHypothesis(candidate, alternative) ||
          alreadyAttempted(budget, alternative, inverse, true)) continue
        selected = { candidate: alternative, inverseLuminance: inverse, final: modules, lateAttempted: false }
        budget.alternateGrid = selected
        return
      }
    }
  }
  return secondLook(...args)
}

/** Existing grids only, strictly validated after every previous return path. */
function recoverAlternateGrid(budget: Budget): DecodeResult | undefined {
  const retained = budget.alternateGrid
  if (!retained || retained.lateAttempted) return undefined
  const { candidate, inverseLuminance } = retained, size = candidate.location.size
  for (const grid of [retained.final, retained.mesh]) {
    if (!grid) continue
    const read: ModuleReader = candidate.mirrored ? (x, y) => grid[x * size + y] === 1 : (x, y) => grid[y * size + x] === 1
    if (!formatAgrees(read, size, candidate.ecc, candidate.mask)) continue
    const result = readSymbol(read, size)
    if (result && result.ecc === candidate.ecc && result.mask === candidate.mask)
      return { ...result, mirrored: candidate.mirrored, inverted: inverseLuminance || candidate.inverted,
        location: where(candidate.location, 1) }
  }
  return undefined
}
'''

if __name__ == '__main__':
    main()
