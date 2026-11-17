#!/usr/bin/env python3
"""Copy released 0.3.8 sources with one deferred ordinary-to-late refinement.

Usage: python3 prototype.py ROOT NEW_OUTSRC
Only copied decode.ts changes. No compilation or decoder execution.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

REVISION = '29c18aa8c63df53ced3d08ed4dbd0fa1f876905d'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    root, dest = (Path(p).resolve() for p in sys.argv[1:])
    source = root / 'src'
    if dest.exists() or dest == source or source in dest.parents:
        raise ValueError('Destination must be new and outside ROOT/src')
    revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if revision != REVISION:
        raise ValueError('Expected released baseline ' + REVISION)
    files = {str(p.relative_to(source)): p.read_bytes() for p in sorted(source.rglob('*')) if p.is_file()}
    for name, data in files.items():
        expected = subprocess.check_output(['git', '-C', str(root), 'show', REVISION + ':src/' + name])
        if data != expected:
            raise ValueError('Source differs from released baseline: ' + name)
    text = files['decode.ts'].decode()
    changes = []

    def replace(old, new, count=1):
        nonlocal text
        actual = text.count(old)
        if actual != count:
            raise ValueError(f'Expected {count} matches, got {actual}: {old[:160]!r}')
        text = text.replace(old, new)
        changes.append({'needle': old, 'count': count})

    replace('  return recoverHeaderConflict(luminance, inverse, budget, work)\n}', '''  const conflict = recoverHeaderConflict(luminance, inverse, budget, work)
  if (conflict) return conflict
  return recoverOrdinaryCurvature(luminance, inverse, budget, inverseCurvature, work)
}''')
    replace('interface AttemptedCandidate {\n  candidate: Candidate\n  factor: number\n  inverseLuminance: boolean\n}', '''interface AttemptedCandidate {
  candidate: Candidate
  factor: number
  inverseLuminance: boolean
  late: boolean
}''')
    replace('    rememberAttempt(budget, candidate, 1, publicInverse)\n    const result = secondLook(luminance, levels, candidate, work, true, true,',
            '    rememberAttempt(budget, candidate, 1, publicInverse, true)\n    const result = secondLook(luminance, levels, candidate, work, true, true,')
    replace('''/** Only the original four attempts are remembered; no storage on a direct read. */
function rememberAttempt(budget: Budget, candidate: Candidate, factor: number, inverseLuminance: boolean): void {
  const attempted = budget.attempted ??= []
  if (attempted.length < SECOND_LOOKS) attempted.push({ candidate, factor, inverseLuminance })
}''', '''/** Remembers the six earlier attempts and their refinement phase; no storage on a direct read. */
function rememberAttempt(budget: Budget, candidate: Candidate, factor: number, inverseLuminance: boolean, late = false): void {
  const attempted = budget.attempted ??= []
  if (attempted.length < SECOND_LOOKS + 2) attempted.push({ candidate, factor, inverseLuminance, late })
}''')
    replace('function alreadyAttempted(budget: Budget, candidate: Candidate, inverseLuminance: boolean): boolean {',
            'function alreadyAttempted(budget: Budget, candidate: Candidate, inverseLuminance: boolean, late?: boolean): boolean {')
    replace('    if (attempt.factor !== 1 || attempt.inverseLuminance !== inverseLuminance) return false',
            '    if (attempt.factor !== 1 || attempt.inverseLuminance !== inverseLuminance ||\n      (late !== undefined && attempt.late !== late)) return false')
    # Record terminal attempts only after their released admission/selection.
    # Thus the fifth attempt still sees precisely the original first four.
    replace('''      const payload = secondLook(image, thresholds(image), candidate, work, true, true,''',
            '''      rememberAttempt(budget, candidate, 1, inverseLuminance, true)
      const payload = secondLook(image, thresholds(image), candidate, work, true, true,''')
    replace('''\n  const payload = secondLook(image, thresholds(image), candidate, work, true, true,''',
            '''\n  rememberAttempt(budget, candidate, 1, inverseLuminance, true)
  const payload = secondLook(image, thresholds(image), candidate, work, true, true,''')
    text += '\n' + RECOVERY
    for name, data in files.items():
        if (source / name).read_bytes() != data:
            raise RuntimeError('Source changed during preparation: ' + name)
    dest.mkdir(parents=True)
    for name, data in files.items():
        out = dest / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(text.encode() if name == 'decode.ts' else data)
    identity = {'revision': revision, 'prototypeSha256': sha(Path(__file__).read_bytes()),
                'sourceFiles': {name: sha(data) for name, data in files.items()},
                'copiedFiles': {name: sha((dest / name).read_bytes()) for name in files},
                'replacements': changes,
                'selection': 'First original-then-inverse retained curvature candidate with an ordinary attempt and no late attempt, exact matrix/basis/factor/header identity, only after every released return path fails',
                'bounds': {'maps': 720, 'second': 7, 'probed': 10062500,
                           'attemptRecords': 6, 'retainedModuleBytes': 156645},
                'memoryNote': 'Four old grids plus one sequential terminal grid; excludes active refinement storage and implementation/GC overhead'}
    (dest / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    print(json.dumps({'source': str(dest), 'identity': str(dest / 'identity.json')}))


RECOVERY = r'''
/**
 * An ordinary refinement does not include the late frozen-anchor pass. After
 * every earlier recovery fails, try that pass on the first retained map which
 * had only ordinary refinement. This is one attempt, even when it fails.
 */
function recoverOrdinaryCurvature(luminance: Luminance, inverse: Luminance | undefined,
  budget: Budget, inverseCandidates: Candidate[] | undefined, work?: Work): DecodeResult | undefined {
  for (const inverseLuminance of [false, true]) {
    const image = inverseLuminance ? inverse : luminance
    const candidates = inverseLuminance ? inverseCandidates : budget.curvature
    if (!image || !candidates) continue
    for (const candidate of candidates) {
      if (!candidate.location.matrix ||
        !alreadyAttempted(budget, candidate, inverseLuminance, false) ||
        alreadyAttempted(budget, candidate, inverseLuminance, true)) continue
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
