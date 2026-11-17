#!/usr/bin/env python3
"""Prepare one bounded starvation-recovery prototype without executing it.

Usage: python3 prototype.py ROOT OUTSRC
OUTSRC must be new and outside ROOT/src. Only copied decode.ts is changed.
"""
import hashlib
import json
import pathlib
import subprocess
import sys


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    root, dest = (pathlib.Path(s).resolve() for s in sys.argv[1:])
    source = root / 'src'
    if dest.exists() or dest == source or source in dest.parents:
        raise SystemExit('OUTSRC must be new and outside ROOT/src')
    original = {str(p.relative_to(source)): p.read_bytes() for p in sorted(source.rglob('*')) if p.is_file()}
    text = original['decode.ts'].decode()
    replacements = []

    def replace(old, new, count=1):
        nonlocal text
        actual = text.count(old)
        if actual != count:
            raise RuntimeError(f'Expected {count} occurrences, found {actual}: {old[:160]!r}')
        text = text.replace(old, new)
        replacements.append({'needle': old, 'count': count})

    replace('  return recoverMeshGrids(budget)\n}', '''  const meshResult = recoverMeshGrids(budget)
  if (meshResult) return meshResult
  return recoverUnattemptedCurvature(luminance, inverse, budget, inverseCurvature, work)
}''')
    replace('  meshGrids: MeshGrid[]\n', '  meshGrids: MeshGrid[]\n  attempted?: AttemptedCandidate[]\n')
    replace('interface MeshGrid {', '''interface AttemptedCandidate {
  candidate: Candidate
  factor: number
  inverseLuminance: boolean
}

interface MeshGrid {''')
    calls = [
        ('secondLook(luminance, levels, candidate, work, strict, false, meshCollector(budget, candidate, f, publicInverse))', 'f', 'publicInverse', 1),
        ('secondLook(luminance, levels, candidate, work, true, false, meshCollector(budget, candidate, 1))', '1', 'false', 2),
        ('secondLook(luminance, levels, candidate, work, true, true, meshCollector(budget, candidate, 1, publicInverse))', '1', 'publicInverse', 1),
    ]
    for call, factor, basis, count in calls:
        replace('    const result = ' + call,
                f'    rememberAttempt(budget, candidate, {factor}, {basis})\n    const result = ' + call, count)
    text += '\n' + RECOVERY

    for name, data in original.items():
        if (source / name).read_bytes() != data:
            raise RuntimeError(f'Source changed during preparation: {name}')
    dest.mkdir(parents=True)
    for name, data in original.items():
        out = dest / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(text.encode() if name == 'decode.ts' else data)
    identity = {
        'prototype': 'one-final-unattempted-curvature-candidate',
        'root': str(root),
        'revision': subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip(),
        'builderSha256': sha(pathlib.Path(__file__).read_bytes()),
        'sourceFiles': {name: sha(data) for name, data in original.items()},
        'copiedFiles': {name: sha((dest / name).read_bytes()) for name in original},
        'replacements': replacements,
        'selection': 'only after the original second-look budget is exhausted; original retained curvature queue then inverse queue; retained order; first matrix candidate not attempted in any original phase at same factor and luminance basis',
        'limits': {'originalSecondLooks': 4, 'extraSecondLooks': 1, 'totalSecondLooks': 5,
                   'totalAlignmentProbesBound': 7187500, 'totalRetainedModuleBytesBound': 156645},
        'notes': ['No new map search or header reads', 'All old success paths, including deferred mesh reads, retain precedence',
                  'Candidate matrices compared coefficient-wise; no approximate project equivalence',
                  'All current queued candidates are locator maps with matrices; future matrix-less candidates are ineligible'],
    }
    (dest / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    print(json.dumps({'source': str(dest), 'identity': str(dest / 'identity.json'), 'decodeSha256': sha(text.encode())}))


RECOVERY = r'''
/** Only the original four attempts are remembered; no storage on a direct read. */
function rememberAttempt(budget: Budget, candidate: Candidate, factor: number, inverseLuminance: boolean): void {
  const attempted = budget.attempted ??= []
  if (attempted.length < SECOND_LOOKS) attempted.push({ candidate, factor, inverseLuminance })
}

/** Candidates are original locator homographies, never the temporary bent mesh. */
function alreadyAttempted(budget: Budget, candidate: Candidate, inverseLuminance: boolean): boolean {
  const matrix = candidate.location.matrix
  return (budget.attempted ?? []).some(attempt => {
    if (attempt.factor !== 1 || attempt.inverseLuminance !== inverseLuminance) return false
    const other = attempt.candidate
    if (other.location.size !== candidate.location.size || other.mirrored !== candidate.mirrored ||
      other.inverted !== candidate.inverted || other.ecc !== candidate.ecc || other.mask !== candidate.mask) return false
    const previous = other.location.matrix
    return !!matrix && !!previous && matrix.length === previous.length && matrix.every((value, i) => value === previous[i])
  })
}

/**
 * After every released success path fails, allow one previously unattempted
 * exact-version candidate. This is one extra attempt, not another queue pass.
 */
function recoverUnattemptedCurvature(luminance: Luminance, inverse: Luminance | undefined,
  budget: Budget, inverseCandidates: Candidate[] | undefined, work?: Work): DecodeResult | undefined {
  if (budget.second !== 0) return undefined
  for (const inverseLuminance of [false, true]) {
    const image = inverseLuminance ? inverse : luminance
    const candidates = inverseLuminance ? inverseCandidates : budget.curvature
    if (!image || !candidates) continue
    for (const candidate of candidates) {
      // locate and locateCorners always supply matrices. Do not guess whether
      // arbitrary future nonlinear projection functions describe the same map.
      if (!candidate.location.matrix || alreadyAttempted(budget, candidate, inverseLuminance)) continue
      if (work) work.second++
      let modules: Uint8Array | undefined
      const payload = secondLook(image, thresholds(image), candidate, work, true, true,
        grid => { modules = grid })
      const inverted = inverseLuminance || candidate.inverted
      const location = where(candidate.location, 1)
      if (payload) return { ...payload, mirrored: candidate.mirrored, inverted, location }
      if (modules) {
        const grid = modules, size = candidate.location.size
        const read: ModuleReader = candidate.mirrored ? (x, y) => grid[x * size + y] === 1 : (x, y) => grid[y * size + x] === 1
        if (formatAgrees(read, size, candidate.ecc, candidate.mask)) {
          const result = readSymbol(read, size)
          if (result && result.ecc === candidate.ecc && result.mask === candidate.mask)
            return { ...result, mirrored: candidate.mirrored, inverted, location }
        }
      }
      return undefined
    }
  }
  return undefined
}
'''


if __name__ == '__main__':
    main()
