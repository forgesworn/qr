#!/usr/bin/env python3
"""Prepare an unobserved streaming header-rediscovery prototype in copied sources.
Usage: python3 prototype.py ROOT EXACT_BASELINE_COMMIT NEW_SOURCE
No builds, tests or decoder execution; ROOT is never changed.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

BASELINE = 'f129243285ce6d2c57819e1aa91b70807bb74741'
def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    root, revision, destination = Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]).resolve()
    if revision != BASELINE:
        raise ValueError('Expected exact released 0.3.11 commit')
    git = lambda *args: subprocess.check_output(['git', '-C', str(root), *args])
    if git('rev-parse','HEAD').decode().strip() != revision:
        raise ValueError('Root HEAD differs from baseline')
    if destination.exists() or destination == root or root in destination.parents:
        raise ValueError('Destination must be new and outside checkout')
    expected_path = Path(__file__).with_name('expected-sources.json')
    expected = json.loads(expected_path.read_text())
    files = {p.name:p.read_bytes() for p in sorted((root/'src').glob('*.ts'))}
    if {name:sha(data) for name,data in files.items()} != expected:
        raise ValueError('Source differs from released qualification')
    for name,data in files.items():
        if git('show',revision+':src/'+name) != data:
            raise ValueError('Uncommitted source '+name)
    changes=[]
    def replace(text,old,new,filename):
        if text.count(old) != 1:
            raise ValueError(f'{filename}: expected one match for {old[:100]!r}, got {text.count(old)}')
        changes.append({'file':filename,'needle':old,'count':1})
        return text.replace(old,new)
    decode=files['decode.ts'].decode()
    decode=replace(decode,'import { agreement, agreementRead,','import { agreement, agreementRead, singleFormatAgreement,','decode.ts')
    decode=replace(decode,'  alternateGrid?: AlternateGrid\n','  alternateGrid?: AlternateGrid\n  rediscoveredGrid?: RediscoveredGrid\n','decode.ts')
    decode=replace(decode,'  return recoverAlternateGrid(budget)\n}', '''  const alternate = recoverAlternateGrid(budget)
  if (alternate) return alternate
  return recoverRediscoveredGrid(budget)
}''','decode.ts')
    decode=replace(decode,'  if (pending) return secondLook(...args)\n', '''  if (pending) {
    if (!budget.rediscoveredGrid) args[7] = modules => keepRediscoveredGrid(budget, inverseLuminance, candidate, modules)
    return secondLook(...args)
  }
''','decode.ts')
    decode=replace(decode,'  args[7] = modules => {\n', '''  args[7] = modules => {
    keepRediscoveredGrid(budget, inverseLuminance, candidate, modules)
''','decode.ts')
    decode+='\n'+DECODE_HELPER
    refine=files['refine.ts'].decode()+'\n'+REFINE_HELPER
    for name,data in files.items():
        if (root/'src'/name).read_bytes()!=data:
            raise ValueError('Source changed during preparation')
    destination.mkdir(parents=True)
    (destination/'package.json').write_text('{"type":"module"}\n')
    changed={'decode.ts':decode.encode(),'refine.ts':refine.encode()}
    for name,data in files.items():
        (destination/name).write_bytes(changed.get(name,data))
    identity={'revision':revision,'prototypeSha256':sha(Path(__file__).read_bytes()),
      'expectedSourcesSha256':sha(expected_path.read_bytes()),'sourceFiles':expected,
      'copiedFiles':{name:sha((destination/name).read_bytes()) for name in files},'replacements':changes,
      'policy':'Versions7–40 only. At failed actual full-size late final-grid capture, keep first different mirrored/ECC/mask tuple whose two formats agree within existing radius2; original orientation then transpose. One slot, no replacement. All released returns including alternate-grid recovery remain first; one strict symbol read after complete failure. No payload selection or new sampling.',
      'bounds':{'secondaryAttempts':8,'maps':720,'alignmentProbes':11500000,'extraImageSamples':0,
        'extraSymbolReads':1,'newRetainedModuleBytes':31329,'conservativeCombinedRetainedModuleBytes':250632,
        'maximumOrientationHeaderChecks':16}}
    (destination/'identity.json').write_text(json.dumps(identity,indent=2)+'\n')
    print(json.dumps({'source':str(destination),'identity':str(destination/'identity.json')}))

DECODE_HELPER=r'''
interface RediscoveredGrid {
  candidate: Candidate
  inverseLuminance: boolean
  modules: Uint8Array
}

/** Retain the first strict format rediscovery from an existing failed late grid. */
function keepRediscoveredGrid(budget: Budget, inverseLuminance: boolean, original: Candidate, modules: Uint8Array): void {
  if (budget.rediscoveredGrid) return
  const size = original.location.size
  if (size < 45 || size > 177 || (size - 17) % 4 !== 0) return
  for (const mirrored of [original.mirrored, !original.mirrored]) {
    const read: ModuleReader = mirrored ? (x, y) => modules[x * size + y] === 1 : (x, y) => modules[y * size + x] === 1
    const agreed = singleFormatAgreement(read, size)
    if (!agreed || (mirrored === original.mirrored && agreed.ecc === original.ecc && agreed.mask === original.mask)) continue
    budget.rediscoveredGrid = { candidate: { ...original, ...agreed, mirrored }, inverseLuminance, modules }
    return
  }
}

/** No earlier success is displaced; a failed strict read never selects another grid. */
function recoverRediscoveredGrid(budget: Budget): DecodeResult | undefined {
  const retained = budget.rediscoveredGrid
  if (!retained) return undefined
  const { candidate, inverseLuminance, modules } = retained, size = candidate.location.size
  const read: ModuleReader = candidate.mirrored ? (x, y) => modules[x * size + y] === 1 : (x, y) => modules[y * size + x] === 1
  if (!formatAgrees(read, size, candidate.ecc, candidate.mask)) return undefined
  const payload = readSymbol(read, size)
  if (!payload || payload.ecc !== candidate.ecc || payload.mask !== candidate.mask) return undefined
  return { ...payload, mirrored: candidate.mirrored, inverted: inverseLuminance || candidate.inverted,
    location: where(candidate.location, 1) }
}
'''
REFINE_HELPER=r'''
/** The existing strict format rule for one supplied orientation, without cross-orientation ranking. */
export function singleFormatAgreement(read: ModuleReader, size: number): { ecc: ErrorCorrection; mask: number; distance: number } | undefined {
  let first = 0
  let second = 0
  for (let i = 14; i >= 0; i--) {
    const [x, y] = FORMAT_COORDS[i]!
    first = (first << 1) | (read(x, y) ? 1 : 0)
    second = (second << 1) | (read(i < 8 ? size - 1 - i : 8, i < 8 ? 8 : size - 7 + (i - 8)) ? 1 : 0)
  }
  for (const f of FORMATS) {
    const distance = Math.max(popcount(f.bits ^ first), popcount(f.bits ^ second))
    if (distance <= AGREEMENT) return { ecc: f.ecc, mask: f.mask, distance }
  }
  return undefined
}
'''
if __name__ == '__main__':
    main()
