#!/usr/bin/env python3
"""Prepare one bounded late version-peer recovery in copied 0.3.9 sources.
Usage: python3 prototype.py ROOT NEW_OUTSRC
No compilation, tests, decoder execution or production edits.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

REVISION = 'd6a411ca26f01f9a2b32e7a3e7bcccbbdefc7a63'


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
        changes.append({'file': 'decode.ts', 'needle': old, 'count': count})

    replace('readSymbol, curvatureHeader, type ModuleReader', 'readSymbol, curvatureHeader, versionPeerHeader, type ModuleReader')
    replace('  return recoverOrdinaryCurvature(luminance, inverse, budget, inverseCurvature, work)\n}', '''  const ordinary = recoverOrdinaryCurvature(luminance, inverse, budget, inverseCurvature, work)
  if (ordinary) return ordinary
  return recoverVersionPeer(luminance, inverse, budget, work)
}''')
    replace('  conflict?: { candidate: Candidate; inverseLuminance: boolean }', '''  conflict?: { candidate: Candidate; inverseLuminance: boolean }
  versionPeer?: { candidate: Candidate; inverseLuminance: boolean }''')
    replace('''    const header = curvatureHeader(mirrored ? (x, y) => sample(y, x) : sample, size, allowConflict)
    if (!header) continue''', '''    const read: ModuleReader = mirrored ? (x, y) => sample(y, x) : sample
    const header = curvatureHeader(read, size, allowConflict)
    if (!header) {
      // Existing curvature and format-conflict ranking is unchanged. Only a
      // rejected map can fill the first version-peer slot, across both bases.
      if (conflictBudget && matrix && !conflictBudget.versionPeer) {
        const peer = versionPeerHeader(read, size)
        if (peer) conflictBudget.versionPeer = {
          candidate: { location, inverted, mirrored, ...peer }, inverseLuminance,
        }
      }
      continue
    }''')
    replace('/** Remembers the six earlier attempts and their refinement phase; no storage on a direct read. */',
            '/** Remembers the seven earlier attempts and their refinement phase; no storage on a direct read. */')
    replace('if (attempted.length < SECOND_LOOKS + 2)', 'if (attempted.length < SECOND_LOOKS + 3)')
    # Record the seventh only after its original selection. Earlier fifth and
    # seventh selection therefore see exactly their released attempt history.
    replace('''        alreadyAttempted(budget, candidate, inverseLuminance, true)) continue
      if (work) work.second++
      let modules: Uint8Array | undefined
      const payload = secondLook''', '''        alreadyAttempted(budget, candidate, inverseLuminance, true)) continue
      if (work) work.second++
      let modules: Uint8Array | undefined
      rememberAttempt(budget, candidate, 1, inverseLuminance, true)
      const payload = secondLook''')
    text += '\n' + RECOVERY
    symbol = files['symbol.ts'].decode() + '\n' + HEADER
    for name, data in files.items():
        if (source / name).read_bytes() != data:
            raise RuntimeError('Source changed during preparation: ' + name)
    dest.mkdir(parents=True)
    for name, data in files.items():
        out = dest / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(text.encode() if name == 'decode.ts' else symbol.encode() if name == 'symbol.ts' else data)
    identity = {
        'revision': revision, 'prototypeSha256': sha(Path(__file__).read_bytes()),
        'sourceFiles': {name: sha(data) for name, data in files.items()},
        'copiedFiles': {name: sha((dest / name).read_bytes()) for name in files},
        'replacements': changes, 'addedHelpers': ['versionPeerHeader', 'recoverVersionPeer'],
        'selection': 'First actual full-size rejected curvature map with one exact matching version word, decoded contradictory version peer at distance 3, both decoded format copies agreeing within 3; one slot across original/inverse bases, defensively skip any prior matching late attempt',
        'priority': 'Every released return path including ordinary-to-late recovery remains first; at most one additional strict late attempt and strict direct mesh read',
        'bounds': {'maps': 720, 'second': 8, 'probed': 11500000, 'attemptRecords': 7,
                   'versionPeerRecords': 1, 'retainedModuleBytes': 156645,
                   'optionalMeshCaptureSamples': 250632},
        'memoryNote': 'Four original retained grids plus one sequential terminal grid; excludes active refinement storage and implementation/GC overhead. The peer record retains a locator map and basis flag, no new image plane or sampling closure.',
        'oneSlotProof': 'All original late candidates and terminal attempts five/seven come from nonconflicting-version curvatureHeader; terminal six also requires nonconflicting versions. Thus a version-peer map cannot match any earlier late attempt. Ordinary attempts are permitted. Same matrix, size, orientation, polarity and luminance basis imply the same header samples; full-size only. Final late check is defensive against future admission changes.',
    }
    (dest / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    print(json.dumps({'source': str(dest), 'identity': str(dest / 'identity.json'),
                      'prototypeSha256': identity['prototypeSha256'],
                      'decodeSha256': identity['copiedFiles']['decode.ts'],
                      'symbolSha256': identity['copiedFiles']['symbol.ts']}))


HEADER = r'''
/**
 * An exact matching version word with a contradictory peer at the outer BCH
 * radius can indicate warped header sampling. Both decoded format copies must
 * agree. This only admits late refinement; it never admits a decoded payload.
 */
export function versionPeerHeader(read: ModuleReader, size: number): {ecc: ErrorCorrection; mask: number; distance: number} | undefined {
  if (size < 45 || size > 177 || (size - 17) % 4 !== 0) return undefined
  let va = 0, vb = 0
  for (let k = 17; k >= 0; k--) {
    const i = Math.floor(k / 3), j = k % 3
    va = (va << 1) | +read(i, size - 11 + j)
    vb = (vb << 1) | +read(size - 11 + j, i)
  }
  const version = (size - 17) / 4, expected = versionBits(version)
  if (va !== expected && vb !== expected) return undefined
  const word = va === expected ? vb : va
  const peer = nearest(VERSIONS, [word])
  if (!peer || peer.version === version || popcount(peer.bits ^ word) !== 3) return undefined
  let a = 0, b = 0
  for (let i = 14; i >= 0; i--) {
    const [x, y] = FORMAT_COORDS[i]!
    a = (a << 1) | +read(x, y)
    b = (b << 1) | +read(i < 8 ? size - 1 - i : 8, i < 8 ? 8 : size - 7 + i - 8)
  }
  const first = nearest(FORMATS, [a]), second = nearest(FORMATS, [b])
  if (!first || !second || first.bits !== second.bits) return undefined
  return { ecc: first.ecc, mask: first.mask,
    distance: Math.min(popcount(first.bits ^ a), popcount(second.bits ^ b)) }
}
'''

RECOVERY = r'''
/**
 * First version-peer map only, after all released recovery paths fail. Earlier
 * late queues reject this header class; the identity check remains defensive.
 * An ordinary attempt does not include the late frozen-anchor refinement.
 */
function recoverVersionPeer(luminance: Luminance, inverse: Luminance | undefined,
  budget: Budget, work?: Work): DecodeResult | undefined {
  const retained = budget.versionPeer
  if (!retained) return undefined
  const { candidate, inverseLuminance } = retained
  if (alreadyAttempted(budget, candidate, inverseLuminance, true)) return undefined
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
