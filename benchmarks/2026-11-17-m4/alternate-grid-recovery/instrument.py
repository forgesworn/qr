#!/usr/bin/env python3
"""Copy exact released source and observe alternate reads of existing late grids.
Usage: python3 instrument.py ROOT EXACT_BASELINE_COMMIT NEW_OUTSRC
No compiler, tests or decoder is run; only copied sources are changed.
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
        raise ValueError('Supply the exact 40-character released baseline commit')
    if subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() != revision:
        raise ValueError('Checkout HEAD differs from the supplied baseline')
    if dest.exists() or dest == source or source in dest.parents:
        raise ValueError('Destination must be new and outside ROOT/src')
    expected_path = Path(__file__).with_name('expected-sources.json')
    expected = json.loads(expected_path.read_text())
    files = {str(p.relative_to(source)): p.read_bytes() for p in sorted(source.rglob('*')) if p.is_file()}
    if {name: sha(data) for name, data in files.items()} != expected:
        raise ValueError('Source differs from the frozen final 0.3.10 candidate')
    for name, data in files.items():
        if subprocess.check_output(['git', '-C', str(root), 'show', revision + ':src/' + name]) != data:
            raise ValueError('Uncommitted source: ' + name)
    text = files['decode.ts'].decode()
    changes = []

    def replace(old, new, count=1):
        nonlocal text
        if text.count(old) != count:
            raise ValueError(f'Expected {count} matches: {old[:140]!r}, got {text.count(old)}')
        text = text.replace(old, new)
        changes.append({'file': 'decode.ts', 'needle': old, 'count': count})

    replace('import { agreedVersion,', 'import { __qrAlternateEvidence, agreedVersion,')
    signature = 'export function decodeCounted(image: ImageLike, options: DecodeOptions = {}, work?: Work, workspace?: DecodeWorkspace): DecodeResult | undefined {'
    replace(signature, signature + '''
  __alternatePending = undefined
  const hook = (globalThis as typeof globalThis & {__qrAlternateGridTrace?: AlternateHook}).__qrAlternateGridTrace
  __alternateState = hook ? {hook, attempts: []} : undefined
  try {
    const result = __alternateDecodeCounted(image, options, work, workspace)
    if (result) __alternatePending = undefined
    __alternateState?.hook({kind:'decode-end',read:result!==undefined,pending:__alternatePending!==undefined})
    return result
  } catch (error) {
    __alternatePending = undefined
    throw error
  } finally {
    __alternateState = undefined
  }
}

function __alternateDecodeCounted(image: ImageLike, options: DecodeOptions = {}, work?: Work, workspace?: DecodeWorkspace): DecodeResult | undefined {''')
    replace('  return recoverVersionPeer(luminance, inverse, budget, work)\n}', '''  const result = recoverVersionPeer(luminance, inverse, budget, work)
  __alternateFinish(budget, inverseCurvature, !result)
  return result
}''')
    replace('secondLook(luminance, levels, candidate, work, strict, false, meshCollector(budget, candidate, f, publicInverse))',
            "__alternateSecond('look', f, publicInverse, luminance, levels, candidate, work, strict, false, meshCollector(budget, candidate, f, publicInverse))")
    replace('secondLook(luminance, levels, candidate, work, true, false, meshCollector(budget, candidate, 1))',
            "__alternateSecond('version-or-overflow', 1, false, luminance, levels, candidate, work, true, false, meshCollector(budget, candidate, 1))", 2)
    replace('secondLook(luminance, levels, candidate, work, true, true, meshCollector(budget, candidate, 1, publicInverse))',
            "__alternateSecond('curvature', 1, publicInverse, luminance, levels, candidate, work, true, true, meshCollector(budget, candidate, 1, publicInverse))")
    # Each terminal has a separate identity while using the same capture wrapper.
    for function, phase in [('recoverUnattemptedCurvature','unattempted'), ('recoverHeaderConflict','format-conflict'),
                            ('recoverOrdinaryCurvature','ordinary-to-late'), ('recoverVersionPeer','version-peer')]:
        start = text.index('function ' + function + '(')
        end = text.find('\nfunction ', start + 1)
        if end == -1:
            end = len(text)
        fragment = text[start:end]
        old = 'secondLook(image, thresholds(image), candidate, work, true, true,'
        if fragment.count(old) != 1:
            raise ValueError('Unexpected terminal call in ' + function)
        text = text[:start] + fragment.replace(old, "__alternateSecond('" + phase + "', 1, inverseLuminance, image, thresholds(image), candidate, work, true, true,") + text[end:]
        changes.append({'file':'decode.ts','function':function,'count':1})
    text += '\n' + DECODE_HELPER
    refine = files['refine.ts'].decode()
    old = '''  // Keep this intermediate only after the final-stage read failed.
'''
    if refine.count(old) != 1:
        raise ValueError('Unexpected failed-read capture site')
    refine = refine.replace(old, '''  const alternateCapture = (globalThis as typeof globalThis & {
    __qrAlternateGridCapture?: (modules:Uint8Array)=>void
  }).__qrAlternateGridCapture
  if (alternateCapture) alternateCapture(modules)
''' + old)
    changes.append({'file':'refine.ts','needle':old,'count':1})
    symbol = files['symbol.ts'].decode() + '\n' + HEADER_HELPER
    for name,data in files.items():
        if (source/name).read_bytes() != data:
            raise ValueError('Source changed while copying: '+name)
    dest.mkdir(parents=True)
    for name,data in files.items():
        out=dest/name
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_bytes(text.encode() if name=='decode.ts' else refine.encode() if name=='refine.ts' else symbol.encode() if name=='symbol.ts' else data)
    identity={'revision':revision,'instrumentSha256':sha(Path(__file__).read_bytes()),
              'expectedSourcesSha256':sha(expected_path.read_bytes()),'sourceFiles':expected,
              'copiedFiles':{name:sha((dest/name).read_bytes()) for name in files},'replacements':changes,
              'selection':'After complete failure, first actual full-size late attempt with an already-retained alternate orientation/header on identical matrix/basis/polarity/size and no matching prior late attempt; actual attempt then queue order',
              'replay':'One selected alternative: strict existing final grid, then already captured mesh only; no new image sampling, maps, refinement or probes',
              'observerMemory':'At most eight existing failed final grids plus their already captured optional meshes during observed decode; only selected grids survive pending replay. Diagnostic retention is not a production memory proposal.'}
    (dest/'identity.json').write_text(json.dumps(identity,indent=2)+'\n')
    print(json.dumps({'source':str(dest),'identity':str(dest/'identity.json')}))


DECODE_HELPER = r'''
type AlternateHook = (event:unknown)=>void
type AlternateAttempt = {
  candidate:Candidate;factor:number;inverseBasis:boolean;phase:string;strict:boolean;late:boolean;
  final?:Uint8Array;mesh?:Uint8Array
}
type AlternatePending = {attempt:AlternateAttempt;alternative:Candidate;index:number}
let __alternateState:{hook:AlternateHook;attempts:AlternateAttempt[]}|undefined
let __alternatePending:AlternatePending|undefined

function __alternateMeta(candidate:Candidate,inverseBasis:boolean) {
  const {location,mirrored,inverted,ecc,mask,distance}=candidate
  return {size:location.size,mirrored,inverted,ecc,mask,distance,basis:inverseBasis?'inverse-luminance':'original',
    publicInverted:inverseBasis||inverted,matrix:location.matrix?Array.from(location.matrix):null,
    finders:[location.topLeft,location.topRight,location.bottomLeft].map(p=>({x:p.x,y:p.y}))}
}
function __alternateGeometry(a:AlternateAttempt,c:Candidate,inverseBasis:boolean):boolean {
  const p=a.candidate,m=p.location.matrix,n=c.location.matrix
  return a.factor===1 && a.inverseBasis===inverseBasis && p.inverted===c.inverted && p.location.size===c.location.size &&
    !!m && !!n && m.length===n.length && m.every((v,i)=>v===n[i])
}
function __alternateHypothesis(a:Candidate,b:Candidate):boolean {
  return a.mirrored===b.mirrored && a.ecc===b.ecc && a.mask===b.mask
}
function __alternateSecond(phase:string,factor:number,inverseBasis:boolean,...args:Parameters<typeof secondLook>):Payload|undefined {
  const state=__alternateState
  if(!state)return secondLook(...args)
  const attempt:AlternateAttempt={candidate:args[2],factor,inverseBasis,phase,strict:args[4]??false,late:args[5]??false}
  const index=state.attempts.length
  state.attempts.push(attempt)
  state.hook({kind:'second-attempt',index,phase,factor,inverseBasis,strict:attempt.strict,late:attempt.late,
    candidate:__alternateMeta(attempt.candidate,inverseBasis)})
  // Capture only genuinely produced full-size late grids. Calling the existing
  // mesh collector unchanged does not add samples or alter its queue capacity.
  const capture=attempt.late && factor===1 && !!attempt.candidate.location.matrix
  const globals=globalThis as typeof globalThis & {__qrAlternateGridCapture?:(modules:Uint8Array)=>void}
  const previous=globals.__qrAlternateGridCapture
  const original=args[6]
  if(capture){
    globals.__qrAlternateGridCapture=modules=>{attempt.final=modules}
    if(original)args[6]=modules=>{original(modules);attempt.mesh=modules}
  }
  let result:Payload|undefined
  try { result=secondLook(...args) }
  finally {
    if(capture){
      if(previous===undefined)delete globals.__qrAlternateGridCapture
      else globals.__qrAlternateGridCapture=previous
    }
  }
  state.hook({kind:'attempt-end',index,read:result!==undefined,finalBytes:attempt.final?.length??0,meshBytes:attempt.mesh?.length??0})
  return result
}
function __alternateFinish(budget:Budget,inverseCandidates:Candidate[]|undefined,failed:boolean):void {
  const state=__alternateState
  if(!state)return
  const queues=[{inverseBasis:false,candidates:budget.curvature},{inverseBasis:true,candidates:inverseCandidates??[]}]
  const retained=queues.flatMap(q=>q.candidates.map(c=>({candidate:__alternateMeta(c,q.inverseBasis),
    lateAttempted:state.attempts.some(a=>a.late&&__alternateGeometry(a,c,q.inverseBasis)&&__alternateHypothesis(a.candidate,c))})))
  let selected:unknown
  if(failed)outer:for(let index=0;index<state.attempts.length;index++){
    const attempt=state.attempts[index]!
    if(!attempt.late||!attempt.final)continue
    for(const queue of queues)for(const alternative of queue.candidates){
      if(!__alternateGeometry(attempt,alternative,queue.inverseBasis)||__alternateHypothesis(attempt.candidate,alternative))continue
      if(state.attempts.some(a=>a.late&&__alternateGeometry(a,alternative,queue.inverseBasis)&&__alternateHypothesis(a.candidate,alternative)))continue
      __alternatePending={attempt,alternative,index}
      selected={index,original:__alternateMeta(attempt.candidate,attempt.inverseBasis),
        alternative:__alternateMeta(alternative,queue.inverseBasis)}
      break outer
    }
  }
  state.hook({kind:'final-retained',failed,retained,selected: selected??null,attempts:state.attempts.length,
    retainedGridBytes:state.attempts.reduce((n,a)=>n+(a.final?.length??0)+(a.mesh?.length??0),0)})
}
/** One-shot strict reads of existing arrays only, after complete decode failure. */
export function __qrReplayAlternateGrid() {
  const pending=__alternatePending;__alternatePending=undefined
  if(!pending)return undefined
  const {attempt,alternative,index}=pending,size=alternative.location.size
  const headers:unknown[]=[]
  let result:DecodeResult|undefined,stage='miss',gridReads=0
  for(const [kind,modules] of [['refined',attempt.final],['mesh',attempt.mesh]] as const){
    if(!modules)continue
    gridReads++
    const read:ModuleReader=alternative.mirrored?(x,y)=>modules[x*size+y]===1:(x,y)=>modules[y*size+x]===1
    const strictFormat=formatAgrees(read,size,alternative.ecc,alternative.mask)
    const payload=strictFormat?readSymbol(read,size):undefined
    headers.push({stage:kind,evidence:__qrAlternateEvidence(read,size),strictFormat,symbolReadable:payload!==undefined})
    if(payload&&payload.ecc===alternative.ecc&&payload.mask===alternative.mask){
      result={...payload,mirrored:alternative.mirrored,inverted:attempt.inverseBasis||alternative.inverted,
        location:where(alternative.location,1)}
      stage=kind
      break
    }
  }
  return {index,phase:attempt.phase,original:__alternateMeta(attempt.candidate,attempt.inverseBasis),
    candidate:__alternateMeta(alternative,attempt.inverseBasis),result,stage,headers,gridReads,
    work:{steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0},newImageSamples:0}
}
'''

HEADER_HELPER = r'''
/** Header evidence from an existing diagnostic grid, never an acceptance rule. */
export function __qrAlternateEvidence(read:ModuleReader,size:number) {
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

if __name__=='__main__':
    main()
