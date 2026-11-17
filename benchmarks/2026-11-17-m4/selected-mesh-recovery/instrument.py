#!/usr/bin/env python3
"""Copy exact QR 0.3.12 sources and observe an existing selected mesh delivery.
Usage: python3 instrument.py ROOT EXACT_BASELINE_COMMIT NEW_SOURCE
Preparation only. The root coordinator alone builds and executes the diagnostic.
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
    if git('rev-parse', 'HEAD').decode().strip() != revision:
        raise ValueError('Root HEAD differs from baseline')
    if destination.exists() or destination == root or root in destination.parents:
        raise ValueError('Destination must be new and outside the checkout')
    expected_path = Path(__file__).with_name('expected-sources.json')
    expected = json.loads(expected_path.read_text())
    files = {p.name:p.read_bytes() for p in sorted((root/'src').glob('*.ts'))}
    if {name:sha(data) for name,data in files.items()} != expected:
        raise ValueError('Source differs from pinned released source')
    for name,data in files.items():
        if git('show',revision+':src/'+name) != data:
            raise ValueError('Uncommitted source '+name)
    changes = []
    def replace(text, old, new, filename):
        count = text.count(old)
        if count != 1:
            raise ValueError(f'{filename}: expected one match for {old[:100]!r}, found {count}')
        changes.append({'file':filename,'needle':old,'count':count})
        return text.replace(old,new)
    decode = files['decode.ts'].decode()
    signature = 'export function decodeCounted(image: ImageLike, options: DecodeOptions = {}, work?: Work, workspace?: DecodeWorkspace): DecodeResult | undefined {'
    decode = replace(decode,signature,signature+WRAPPER,'decode.ts')
    decode = replace(decode,'function alternateSecondLook(budget: Budget, inverseLuminance: boolean,',
        'function __selectedMeshOriginalSecond(budget: Budget, inverseLuminance: boolean,','decode.ts')
    assignment = '    budget.rediscoveredGrid = { candidate: { ...original, ...agreed, mirrored }, inverseLuminance, modules }\n'
    decode = replace(decode,assignment,assignment+'    __selectedMeshChoose(budget.rediscoveredGrid)\n','decode.ts')
    decode += '\n'+HELPER
    refine = files['refine.ts'].decode()
    needle = '    collectMesh(modules)\n'
    refine = replace(refine,needle,needle+'''    // Diagnostic observes only an existing delivery; it never installs a collector.
    const selectedMeshCapture = (globalThis as typeof globalThis & {
      __qrSelectedMeshCapture?: (modules:Uint8Array)=>void
    }).__qrSelectedMeshCapture
    if (selectedMeshCapture) selectedMeshCapture(modules)
''','refine.ts')
    changed = {'decode.ts':decode.encode(),'refine.ts':refine.encode()}
    for name,data in files.items():
        if (root/'src'/name).read_bytes() != data:
            raise ValueError('Source changed during preparation')
    destination.mkdir(parents=True)
    (destination/'package.json').write_text('{"type":"module"}\n')
    for name,data in files.items():
        (destination/name).write_bytes(changed.get(name,data))
    identity = {'revision':revision,'instrumentSha256':sha(Path(__file__).read_bytes()),
        'expectedSourcesSha256':sha(expected_path.read_bytes()),'sourceFiles':expected,
        'copiedFiles':{name:sha((destination/name).read_bytes()) for name in files},
        'packageJsonSha256':sha((destination/'package.json').read_bytes()),'replacements':changes,
        'selection':'Actual production rediscoveredGrid slot assignment, associated with its enclosing full-size late invocation. No diagnostic header selection or backfill.',
        'replay':'After complete baseline failure, one strict read of the existing mesh delivered by the SAME invocation, using the SAME selected orientation/ECC/mask. Clear on success, next decode or consumption.',
        'bounds':'At most one extra mesh reference, no new collector, image sample, map, second look or Work. One format check and at most one readSymbol call; no new image plane.'}
    (destination/'identity.json').write_text(json.dumps(identity,indent=2)+'\n')
    print(json.dumps({'source':str(destination),'identity':str(destination/'identity.json')}))

WRAPPER = r'''
  __selectedMeshPending = undefined
  const hook = (globalThis as typeof globalThis & {__qrSelectedMeshTrace?: SelectedMeshHook}).__qrSelectedMeshTrace
  __selectedMeshState = hook ? {hook,attempts:0} : undefined
  try {
    const result = __selectedMeshDecode(image,options,work,workspace)
    const state = __selectedMeshState
    if (!result && state?.selected?.mesh) __selectedMeshPending = state.selected
    state?.hook({kind:'decode-end',read:result!==undefined,attempts:state.attempts,
      selectedIndex:state.selected?.index??null,meshDelivered:!!state.selected?.mesh,pending:!!__selectedMeshPending})
    return result
  } catch (error) {
    __selectedMeshPending = undefined
    throw error
  } finally {
    __selectedMeshState = undefined
  }
}
function __selectedMeshDecode(image: ImageLike, options: DecodeOptions = {}, work?: Work, workspace?: DecodeWorkspace): DecodeResult | undefined {'''

HELPER = r'''
type SelectedMeshHook = (event:unknown)=>void
type SelectedMeshInvocation = {index:number;candidate:Candidate;inverseBasis:boolean;collectorPresent:boolean}
type SelectedMeshSelection = {index:number;original:Candidate;retained:RediscoveredGrid;mesh?:Uint8Array}
let __selectedMeshState:{hook:SelectedMeshHook;attempts:number;current?:SelectedMeshInvocation|undefined;selected?:SelectedMeshSelection}|undefined
let __selectedMeshPending:SelectedMeshSelection|undefined
function __selectedMeshMeta(candidate:Candidate,inverseBasis:boolean) {
  const {location,mirrored,inverted,ecc,mask}=candidate
  return {size:location.size,mirrored,inverted,ecc,mask,basis:inverseBasis?'inverse-luminance':'original',
    publicInverted:inverseBasis||inverted,matrix:location.matrix?Array.from(location.matrix):null,
    finders:[location.topLeft,location.topRight,location.bottomLeft].map(p=>({x:p.x,y:p.y}))}
}
function __selectedMeshChoose(retained:RediscoveredGrid):void {
  const state=__selectedMeshState
  if(!state)return
  const current=state.current
  if(!current||state.selected)throw Error('Selected grid lacks a unique active late invocation')
  if(current.inverseBasis!==retained.inverseLuminance||current.candidate.location!==retained.candidate.location)
    throw Error('Selected grid belongs to another basis or geometry')
  state.selected={index:current.index,original:current.candidate,retained}
  state.hook({kind:'selected',index:current.index,collectorPresent:current.collectorPresent,
    original:__selectedMeshMeta(current.candidate,current.inverseBasis),
    candidate:__selectedMeshMeta(retained.candidate,retained.inverseLuminance),finalGrid:retained.modules})
}
function alternateSecondLook(budget:Budget,inverseBasis:boolean,...args:Parameters<typeof secondLook>):Payload|undefined {
  const state=__selectedMeshState
  if(!state)return __selectedMeshOriginalSecond(budget,inverseBasis,...args)
  if(state.attempts>=8)throw Error('Unexpected ninth full-size late invocation')
  const current:SelectedMeshInvocation={index:state.attempts++,candidate:args[2],inverseBasis,collectorPresent:!!args[6]}
  const previousCurrent=state.current
  state.current=current
  state.hook({kind:'late-attempt',index:current.index,strict:args[4]??false,late:args[5]??false,factor:1,
    collectorPresent:current.collectorPresent,candidate:__selectedMeshMeta(current.candidate,inverseBasis)})
  const globals=globalThis as typeof globalThis & {__qrSelectedMeshCapture?:(grid:Uint8Array)=>void}
  const previousCapture=globals.__qrSelectedMeshCapture
  let meshDelivered=false,result:Payload|undefined
  globals.__qrSelectedMeshCapture=grid=>{
    if(!current.collectorPresent||meshDelivered)throw Error('Unexpected existing mesh delivery')
    meshDelivered=true
    const selected=state.selected
    const sameInvocation=selected?.index===current.index
    if(selected&&sameInvocation){
      if(grid.length!==selected.retained.candidate.location.size**2)throw Error('Mesh size differs from selected grid')
      if(grid===selected.retained.modules)throw Error('Final and mesh grids unexpectedly alias')
      selected.mesh=grid
    }
    state.hook({kind:'mesh-delivery',index:current.index,selected:!!sameInvocation,bytes:grid.length,
      ...(sameInvocation?{meshGrid:grid}:{})})
  }
  try {result=__selectedMeshOriginalSecond(budget,inverseBasis,...args)}
  finally {
    state.current=previousCurrent
    if(previousCapture===undefined)delete globals.__qrSelectedMeshCapture
    else globals.__qrSelectedMeshCapture=previousCapture
  }
  state.hook({kind:'late-end',index:current.index,read:result!==undefined,meshDelivered})
  return result
}
/** Diagnostic only: consume one existing mesh after every released return path failed. */
export function __qrReplaySelectedMesh() {
  const pending=__selectedMeshPending;__selectedMeshPending=undefined
  if(!pending)return undefined
  const {retained,mesh,index,original}=pending
  if(!mesh)throw Error('Pending replay has no delivered mesh')
  const {candidate,inverseLuminance}=retained,size=candidate.location.size
  const read:ModuleReader=candidate.mirrored?(x,y)=>mesh[x*size+y]===1:(x,y)=>mesh[y*size+x]===1
  const strictFormat=formatAgrees(read,size,candidate.ecc,candidate.mask)
  const payload=strictFormat?readSymbol(read,size):undefined
  const result:DecodeResult|undefined=payload&&payload.ecc===candidate.ecc&&payload.mask===candidate.mask
    ?{...payload,mirrored:candidate.mirrored,inverted:inverseLuminance||candidate.inverted,location:where(candidate.location,1)}:undefined
  return {index,original:__selectedMeshMeta(original,inverseLuminance),candidate:__selectedMeshMeta(candidate,inverseLuminance),
    result,meshGrid:mesh,strictFormat,gridChecks:1,symbolReads:strictFormat?1:0,newImageSamples:0,
    work:{steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0}}
}
'''
if __name__ == '__main__':
    main()
