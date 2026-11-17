#!/usr/bin/env python3
"""Copy pinned 0.3.11 sources; observe header rediscovery on existing failed late grids.
Usage: python3 instrument.py ROOT EXACT_BASELINE_COMMIT NEW_SOURCE
Source preparation only: no compilation or decoder execution.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

BASELINE = 'f129243285ce6d2c57819e1aa91b70807bb74741'

def sha(value):
    return hashlib.sha256(value).hexdigest()

def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    root, revision, destination = Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]).resolve()
    if revision != BASELINE:
        raise ValueError('Expected exact released 0.3.11 commit')
    git = lambda *args: subprocess.check_output(['git', '-C', str(root), *args])
    if git('rev-parse', 'HEAD').decode().strip() != revision:
        raise ValueError('Root HEAD differs from baseline')
    if destination.exists() or destination == root or root in destination.parents:
        raise ValueError('Destination must be new and outside the checkout')
    expected_path = Path(__file__).with_name('expected-sources.json')
    expected = json.loads(expected_path.read_text())
    files = {p.name: p.read_bytes() for p in sorted((root/'src').glob('*.ts'))}
    if {name: sha(data) for name, data in files.items()} != expected:
        raise ValueError('Source differs from pinned released source')
    for name, data in files.items():
        if git('show', revision+':src/'+name) != data:
            raise ValueError('Uncommitted source '+name)
    changes = []
    def replace(text, old, new, filename):
        if text.count(old) != 1:
            raise ValueError(f'{filename}: expected one match for {old[:100]!r}; found {text.count(old)}')
        changes.append({'file':filename, 'needle':old, 'count':1})
        return text.replace(old, new)
    decode = files['decode.ts'].decode()
    decode = replace(decode, 'import { agreedVersion,', 'import { __qrRediscoveryEvidence, agreedVersion,', 'decode.ts')
    signature = 'export function decodeCounted(image: ImageLike, options: DecodeOptions = {}, work?: Work, workspace?: DecodeWorkspace): DecodeResult | undefined {'
    decode = replace(decode, signature, signature + '''
  __rediscoveryPending = undefined
  const hook = (globalThis as typeof globalThis & {__qrHeaderRediscoveryTrace?: RediscoveryHook}).__qrHeaderRediscoveryTrace
  __rediscoveryState = hook ? {hook, attempts:[]} : undefined
  try {
    const result = __rediscoveryDecode(image, options, work, workspace)
    if (!result) __rediscoveryFinish()
    else __rediscoveryPending = undefined
    __rediscoveryState?.hook({kind:'decode-end', read:result!==undefined, pending:__rediscoveryPending!==undefined})
    return result
  } catch (error) {
    __rediscoveryPending = undefined
    throw error
  } finally {
    __rediscoveryState = undefined
  }
}
function __rediscoveryDecode(image: ImageLike, options: DecodeOptions = {}, work?: Work, workspace?: DecodeWorkspace): DecodeResult | undefined {''', 'decode.ts')
    decode = replace(decode, 'function alternateSecondLook(budget: Budget, inverseLuminance: boolean,', 'function __rediscoveryOriginalSecond(budget: Budget, inverseLuminance: boolean,', 'decode.ts')
    decode += '\n'+DECODE_HELPER
    refine = files['refine.ts'].decode()
    needle = '  if (collectFinal) collectFinal(modules)\n'
    refine = replace(refine, needle, needle + '''  const rediscoveryCapture = (globalThis as typeof globalThis & {
    __qrHeaderRediscoveryCapture?: (grid:Uint8Array)=>void
  }).__qrHeaderRediscoveryCapture
  if (rediscoveryCapture) rediscoveryCapture(modules)
''', 'refine.ts')
    symbol = files['symbol.ts'].decode()+'\n'+HEADER_HELPER
    changed = {'decode.ts':decode.encode(), 'refine.ts':refine.encode(), 'symbol.ts':symbol.encode()}
    for name,data in files.items():
        if (root/'src'/name).read_bytes() != data:
            raise ValueError('Source changed during preparation')
    destination.mkdir(parents=True)
    (destination/'package.json').write_text('{"type":"module"}\n')
    for name,data in files.items():
        (destination/name).write_bytes(changed.get(name,data))
    identity = {'revision':revision,'instrumentSha256':sha(Path(__file__).read_bytes()),
      'expectedSourcesSha256':sha(expected_path.read_bytes()), 'sourceFiles':expected,
      'copiedFiles':{name:sha((destination/name).read_bytes()) for name in files},
      'packageJsonSha256':sha((destination/'package.json').read_bytes()), 'replacements':changes,
      'selection':'After complete baseline failure: actual full-size late attempt order, original orientation then transpose; first different mirrored/ECC/mask tuple whose existing final grid has two identical format codewords each within radius2. No payload-based choice; no retained-candidate requirement.',
      'replay':'One strict read of the selected existing final grid only; ordinary version/RS/segment validation and selected ECC/mask mandatory. No next candidate or mesh fallback.',
      'bounds':'Diagnostic retains at most8 final grids; <=16 orientation header inspections and one symbol read. No additional images, image samples, maps, secondary attempts or Work.'}
    (destination/'identity.json').write_text(json.dumps(identity,indent=2)+'\n')
    print(json.dumps({'source':str(destination),'identity':str(destination/'identity.json')}))

DECODE_HELPER = r'''
type RediscoveryHook = (event:unknown)=>void
type RediscoveryAttempt = {candidate:Candidate;inverseBasis:boolean;final?:Uint8Array}
type RediscoveryPending = {attempt:RediscoveryAttempt;candidate:Candidate;index:number}
let __rediscoveryState:{hook:RediscoveryHook;attempts:RediscoveryAttempt[]}|undefined
let __rediscoveryPending:RediscoveryPending|undefined
function __rediscoveryMeta(candidate:Candidate,inverseBasis:boolean) {
  const {location,mirrored,inverted,ecc,mask}=candidate
  return {size:location.size,mirrored,inverted,ecc,mask,basis:inverseBasis?'inverse-luminance':'original',
    publicInverted:inverseBasis||inverted,matrix:location.matrix?Array.from(location.matrix):null,
    finders:[location.topLeft,location.topRight,location.bottomLeft].map(p=>({x:p.x,y:p.y}))}
}
function alternateSecondLook(budget:Budget,inverseBasis:boolean,...args:Parameters<typeof secondLook>):Payload|undefined {
  const state=__rediscoveryState
  if(!state)return __rediscoveryOriginalSecond(budget,inverseBasis,...args)
  if(state.attempts.length>=8)throw Error('Unexpected ninth full-size late attempt')
  const attempt:RediscoveryAttempt={candidate:args[2],inverseBasis},index=state.attempts.length
  state.attempts.push(attempt)
  state.hook({kind:'late-attempt',index,strict:args[4]??false,late:args[5]??false,factor:1,
    candidate:__rediscoveryMeta(attempt.candidate,inverseBasis)})
  const globals=globalThis as typeof globalThis & {__qrHeaderRediscoveryCapture?:(grid:Uint8Array)=>void}
  const previous=globals.__qrHeaderRediscoveryCapture
  globals.__qrHeaderRediscoveryCapture=grid=>{attempt.final=grid}
  let result:Payload|undefined
  try {result=__rediscoveryOriginalSecond(budget,inverseBasis,...args)}
  finally {
    if(previous===undefined)delete globals.__qrHeaderRediscoveryCapture
    else globals.__qrHeaderRediscoveryCapture=previous
  }
  state.hook({kind:'late-end',index,read:result!==undefined,finalBytes:attempt.final?.length??0})
  return result
}
function __rediscoveryFinish():void {
  const state=__rediscoveryState
  if(!state)return
  for(let index=0;index<state.attempts.length;index++){
    const attempt=state.attempts[index]!,original=attempt.candidate,grid=attempt.final,size=original.location.size
    if(!grid)continue
    for(const mirrored of [original.mirrored,!original.mirrored]){
      const read:ModuleReader=mirrored?(x,y)=>grid[x*size+y]===1:(x,y)=>grid[y*size+x]===1
      const evidence=__qrRediscoveryEvidence(read,size)
      const first=evidence?.formats[0],second=evidence?.formats[1]
      const agrees=!!first&&!!second&&first.distance<=2&&second.distance<=2&&first.ecc===second.ecc&&first.mask===second.mask
      const different=!!first&&(mirrored!==original.mirrored||first.ecc!==original.ecc||first.mask!==original.mask)
      state.hook({kind:'refined-header',index,mirrored,evidence,agrees,different})
      if(__rediscoveryPending||!agrees||!different||!first)continue
      const candidate:Candidate={...original,mirrored,ecc:first.ecc,mask:first.mask}
      if(!formatAgrees(read,size,candidate.ecc,candidate.mask))throw Error('Header observer disagrees with strict format predicate')
      __rediscoveryPending={attempt,candidate,index}
      state.hook({kind:'selected',index,original:__rediscoveryMeta(original,attempt.inverseBasis),
        candidate:__rediscoveryMeta(candidate,attempt.inverseBasis)})
    }
  }
  state.hook({kind:'retained-summary',attempts:state.attempts.length,
    grids:state.attempts.filter(a=>!!a.final).length,gridBytes:state.attempts.reduce((n,a)=>n+(a.final?.length??0),0)})
}
/** One-shot causal read after released decode failure; no candidate chosen by payload. */
export function __qrReplayHeaderRediscovery() {
  const pending=__rediscoveryPending;__rediscoveryPending=undefined
  if(!pending)return undefined
  const {attempt,candidate,index}=pending,grid=attempt.final!,size=candidate.location.size
  const read:ModuleReader=candidate.mirrored?(x,y)=>grid[x*size+y]===1:(x,y)=>grid[y*size+x]===1
  const strictFormat=formatAgrees(read,size,candidate.ecc,candidate.mask)
  const payload=strictFormat?readSymbol(read,size):undefined
  const result:DecodeResult|undefined=payload&&payload.ecc===candidate.ecc&&payload.mask===candidate.mask
    ?{...payload,mirrored:candidate.mirrored,inverted:attempt.inverseBasis||candidate.inverted,location:where(candidate.location,1)}:undefined
  return {index,original:__rediscoveryMeta(attempt.candidate,attempt.inverseBasis),candidate:__rediscoveryMeta(candidate,attempt.inverseBasis),
    result,headers:__qrRediscoveryEvidence(read,size),strictFormat,gridReads:1,newImageSamples:0,
    work:{steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0}}
}
'''
HEADER_HELPER = r'''
/** Diagnostic evidence only; decoding still uses the existing strict predicates. */
export function __qrRediscoveryEvidence(read:ModuleReader,size:number) {
  if(size<45||(size-17)%4!==0)return undefined
  const closest=<T extends {bits:number}>(table:readonly T[],word:number)=>{
    let entry=table[0]!,distance=popcount(entry.bits^word)
    for(const value of table){const d=popcount(value.bits^word);if(d<distance){entry=value;distance=d}}
    return {...entry,word,distance,decoded:distance<=3}
  }
  let va=0,vb=0,a=0,b=0
  for(let k=17;k>=0;k--){const i=Math.floor(k/3),j=k%3;va=(va<<1)|+read(i,size-11+j);vb=(vb<<1)|+read(size-11+j,i)}
  for(let i=14;i>=0;i--){const[x,y]=FORMAT_COORDS[i]!;a=(a<<1)|+read(x,y);b=(b<<1)|+read(i<8?size-1-i:8,i<8?8:size-7+i-8)}
  return {sizeVersion:(size-17)/4,versions:[closest(VERSIONS,va),closest(VERSIONS,vb)],formats:[closest(FORMATS,a),closest(FORMATS,b)]}
}
'''
if __name__ == '__main__':
    main()
