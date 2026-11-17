#!/usr/bin/env python3
"""Prepare copied sources for one final, confidence-ranked format-conflict retry.

Usage: python3 prototype.py ROOT NEW_OUTSRC
No compiler, decoder or tests are run. Only copied decode.ts and symbol.ts change.
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
    root, dest = (pathlib.Path(value).resolve() for value in sys.argv[1:])
    source = root / 'src'
    if dest.exists() or dest == source or source in dest.parents:
        raise SystemExit('NEW_OUTSRC must be new and outside ROOT/src')
    original = {str(p.relative_to(source)): p.read_bytes() for p in sorted(source.rglob('*')) if p.is_file()}
    changed = {name: original[name].decode() for name in ['decode.ts', 'symbol.ts']}
    replacements = []

    def replace(name, old, new, count=1):
        actual = changed[name].count(old)
        if actual != count:
            raise RuntimeError(f'{name}: expected {count}, found {actual}: {old[:180]!r}')
        changed[name] = changed[name].replace(old, new)
        replacements.append({'file': name, 'needle': old, 'count': count})

    replace('symbol.ts',
            'export function curvatureHeader(read: ModuleReader, size: number): {ecc: ErrorCorrection; mask: number; distance: number} | undefined {',
            'export function curvatureHeader(read: ModuleReader, size: number, allowConflict = false): {ecc: ErrorCorrection; mask: number; distance: number; conflict?: true} | undefined {')
    replace('symbol.ts', '  if (first && second && first.bits !== second.bits) return undefined', '''  if (first && second && first.bits !== second.bits) {
    if (!allowConflict) return undefined
    const firstDistance = popcount(first.bits ^ a), secondDistance = popcount(second.bits ^ b)
    const distance = Math.min(firstDistance, secondDistance)
    if (distance > 2 || Math.max(firstDistance, secondDistance) !== 3) return undefined
    const stronger = firstDistance < secondDistance ? first : second
    return { ecc: stronger.ecc, mask: stronger.mask, distance, conflict: true }
  }''')
    replace('symbol.ts', ' * decode within the ordinary BCH radius. This admits a retry, never a result.', ''' * decode within the ordinary BCH radius. This admits a retry, never a result.
 * The optional conflict mode tags a uniquely stronger format copy (0--2 errors
 * versus 3); callers must keep it separate from ordinary curvature candidates.''')
    replace('decode.ts', '  return recoverUnattemptedCurvature(luminance, inverse, budget, inverseCurvature, work)\n}', '''  const unattempted = recoverUnattemptedCurvature(luminance, inverse, budget, inverseCurvature, work)
  if (unattempted) return unattempted
  return recoverHeaderConflict(luminance, inverse, budget, work)
}''')
    replace('decode.ts', '  attempted?: AttemptedCandidate[]\n', '''  attempted?: AttemptedCandidate[]
  conflict?: { candidate: Candidate; inverseLuminance: boolean }
''')
    replace('decode.ts',
            'const result = read(image, location, inverted, candidates, strict, f, collectHints ? budget.hints : undefined, triple, collectHints ? budget.curvature : inverseCurvature)',
            'const result = read(image, location, inverted, candidates, strict, f, collectHints ? budget.hints : undefined, triple, collectHints ? budget.curvature : inverseCurvature, collectHints || inverseCurvature ? budget : undefined, inverseCurvature !== undefined)')
    replace('decode.ts', '  curvature?: Candidate[],\n): DecodeResult | undefined {', '''  curvature?: Candidate[],
  conflictBudget?: Budget,
  inverseLuminance = false,
): DecodeResult | undefined {''')
    replace('decode.ts', 'if (curvature) keepCurvature(curvature, location, inverted, sample)',
            'if (curvature) keepCurvature(curvature, location, inverted, sample, conflictBudget, inverseLuminance)', 2)
    replace('decode.ts',
            'function keepCurvature(candidates: Candidate[], location: Location, inverted: boolean, sample: ModuleReader): void {',
            'function keepCurvature(candidates: Candidate[], location: Location, inverted: boolean, sample: ModuleReader, conflictBudget?: Budget, inverseLuminance = false): void {')
    replace('decode.ts', '''    const header = curvatureHeader(mirrored ? (x, y) => sample(y, x) : sample, size)
    if (!header) continue''', '''    // One slot: first strong (0/1 errors) wins; first weak (2 errors) is kept
    // only until a strong candidate appears. Normal curvature collection never stops.
    const allowConflict = conflictBudget !== undefined && matrix !== undefined &&
      (conflictBudget.conflict === undefined || conflictBudget.conflict.candidate.distance === 2)
    const header = curvatureHeader(mirrored ? (x, y) => sample(y, x) : sample, size, allowConflict)
    if (!header) continue
    if (header.conflict) {
      if (conflictBudget && (!conflictBudget.conflict || header.distance <= 1)) {
        const candidate: Candidate = { location, inverted, mirrored, ecc: header.ecc, mask: header.mask, distance: header.distance }
        conflictBudget.conflict = { candidate, inverseLuminance }
      }
      continue
    }''')
    changed['decode.ts'] += '\n' + FINAL_RECOVERY

    for name, data in original.items():
        if (source / name).read_bytes() != data:
            raise RuntimeError(f'Source changed during preparation: {name}')
    dest.mkdir(parents=True)
    for name, data in original.items():
        out = dest / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(changed[name].encode() if name in changed else data)
    identity = {
        'prototype': 'one-final-format-conflict-retry',
        'root': str(root),
        'revision': subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip(),
        'builderSha256': sha(pathlib.Path(__file__).read_bytes()),
        'sourceFiles': {name: sha(data) for name, data in original.items()},
        'copiedFiles': {name: sha((dest / name).read_bytes()) for name in original},
        'replacements': replacements,
        'selection': 'one slot across actual full-size curvature collection order and both luminance bases; retain first distance2-vs3 until first distance0or1-vs3, then never replace; exact matching version and no decoded version conflict required',
        'limits': {'originalSecondLooks': 4, 'releasedTerminalRetries': 1, 'newConflictRetries': 1,
                   'totalSecondLooks': 6, 'alignmentProbes': 8625000,
                   'retainedModuleBytes': 156645, 'cumulativeOptionalMeshCaptureProbes': 187974},
        'notes': ['No new map search, size retry or old-queue admission',
                  'Every released return path retains priority, including the fifth attempt and strict saved-mesh reads',
                  'Conflict codeword minimum-distance proof makes retained candidates ineligible for all original attempts at the same map/basis/orientation',
                  'The fifth and conflict mesh grids have sequential lifetimes; neither joins the original four-grid queue',
                  'No runtime or dev dependencies added'],
    }
    (dest / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    print(json.dumps({'source': str(dest), 'identity': str(dest / 'identity.json'),
                      'changed': {name: sha(text.encode()) for name, text in changed.items()}}))


FINAL_RECOVERY = r'''
/**
 * One final attempt at a map with an exact version anchor and a uniquely
 * stronger format copy. Conflicting formats exclude it from all earlier queues.
 */
function recoverHeaderConflict(luminance: Luminance, inverse: Luminance | undefined,
  budget: Budget, work?: Work): DecodeResult | undefined {
  const retained = budget.conflict
  if (!retained) return undefined
  const { candidate, inverseLuminance } = retained
  const image = inverseLuminance ? inverse : luminance
  if (!image) return undefined
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
'''


if __name__ == '__main__':
    main()
