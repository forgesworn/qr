#!/usr/bin/env python3
"""Prepare a copied production-shaped same-call selected-mesh prototype.
Usage: python3 prototype.py ROOT EXACT_BASELINE_COMMIT NEW_SOURCE
Copies source only; never builds, decodes or changes ROOT.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

BASELINE = '0fdcd6262f0cd5ddcd7ec6bfba5d131df01c9a37'
def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    root, revision, destination = Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]).resolve()
    if revision != BASELINE:
        raise ValueError('Expected exact released 0.3.12 commit')
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
    def replace(text,old,new):
        count=text.count(old)
        if count!=1:
            raise ValueError(f'decode.ts: expected one match for {old[:100]!r}, got {count}')
        changes.append({'file':'decode.ts','needle':old,'count':count})
        return text.replace(old,new)
    decode=files['decode.ts'].decode()
    decode=replace(decode,'  return recoverRediscoveredGrid(budget)\n}', '''  const rediscovered = recoverRediscoveredGrid(budget)
  if (rediscovered) return rediscovered
  return recoverRediscoveredGrid(budget, true)
}''')
    decode=replace(decode,'  const candidate = args[2], pending = budget.alternateGrid\n', '''  const candidate = args[2], pending = budget.alternateGrid
  // Only a slot selected during this synchronous call may receive its mesh.
  // Wrap an existing collector; never introduce sampling or backfill an old slot.
  const collectSelectedMesh = args[6]
  if (collectSelectedMesh && !budget.rediscoveredGrid) args[6] = modules => {
    collectSelectedMesh(modules)
    if (budget.rediscoveredGrid) budget.rediscoveredGrid.mesh = modules
  }
''')
    decode=replace(decode,'''interface RediscoveredGrid {
  candidate: Candidate
  inverseLuminance: boolean
  modules: Uint8Array
}''','''interface RediscoveredGrid {
  candidate: Candidate
  inverseLuminance: boolean
  modules: Uint8Array
  mesh?: Uint8Array
}''')
    decode=replace(decode,'''/** No earlier success is displaced; a failed strict read never selects another grid. */
function recoverRediscoveredGrid(budget: Budget): DecodeResult | undefined {''', '''/** Final grid first, then only its same-call mesh; neither read selects another hypothesis. */
function recoverRediscoveredGrid(budget: Budget, mesh = false): DecodeResult | undefined {''')
    decode=replace(decode,'''  const { candidate, inverseLuminance, modules } = retained, size = candidate.location.size
''','''  const { candidate, inverseLuminance } = retained, modules = mesh ? retained.mesh : retained.modules
  if (!modules) return undefined
  const size = candidate.location.size
''')
    for name,data in files.items():
        if (root/'src'/name).read_bytes()!=data:
            raise ValueError('Source changed during preparation')
    destination.mkdir(parents=True)
    (destination/'package.json').write_text('{"type":"module"}\n')
    for name,data in files.items():
        (destination/name).write_bytes(decode.encode() if name=='decode.ts' else data)
    identity={'revision':revision,'prototypeSha256':sha(Path(__file__).read_bytes()),
      'expectedSourcesSha256':sha(expected_path.read_bytes()),'sourceFiles':expected,
      'copiedFiles':{name:sha((destination/name).read_bytes()) for name in files},
      'packageJsonSha256':sha((destination/'package.json').read_bytes()),'replacements':changes,
      'policy':'Preserve every released return, including final rediscovered-grid reading. Attach only the existing mesh delivered in the SAME synchronous full-size late call that first populated the production rediscovered slot. No collector installation, replacement, backfill, header reselection or image sampling. After released failure, at most one strict same-orientation/ECC/mask symbol read on that mesh.',
      'bounds':{'secondaryAttempts':8,'maps':720,'alignmentProbes':11500000,'extraImageSamples':0,
        'extraFormatChecks':1,'extraSymbolReads':1,'newRetainedModuleBytes':31329,
        'conservativeCombinedRetainedModuleBytes':281961,'boundExcludes':'Active sampling arrays and candidate/closure metadata; aliases conservatively counted separately.'}}
    (destination/'identity.json').write_text(json.dumps(identity,indent=2)+'\n')
    print(json.dumps({'source':str(destination),'identity':str(destination/'identity.json')}))

if __name__ == '__main__':
    main()
