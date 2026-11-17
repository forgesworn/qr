#!/usr/bin/env python3
"""Copy pinned source and prepare a read-only version-peer replay observer.
Usage: python3 instrument.py ROOT NEW_OUTSRC
No compiler, test, decoder or timing is run by this builder.
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
    root, dest = (Path(x).resolve() for x in sys.argv[1:])
    source = root / 'src'
    if dest.exists() or dest == source or source in dest.parents:
        raise ValueError('Destination must be new and outside ROOT/src')
    revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if revision != REVISION:
        raise ValueError('Expected revision ' + REVISION)
    original = {str(p.relative_to(source)): p.read_bytes() for p in sorted(source.rglob('*')) if p.is_file()}
    for name, data in original.items():
        expected = subprocess.check_output(['git', '-C', str(root), 'show', REVISION + ':src/' + name])
        if data != expected:
            raise ValueError('Source differs from pinned revision: ' + name)
    text = original['decode.ts'].decode()
    changes = []
    def replace(old, new, count=1):
        nonlocal text
        actual = text.count(old)
        if actual != count:
            raise ValueError(f'Expected {count} occurrences, found {actual}: {old[:160]!r}')
        text = text.replace(old, new)
        changes.append({'needle': old, 'count': count})
    replace('import { agreedVersion, readSymbol, curvatureHeader,', 'import { __qrPeerEvidence, agreedVersion, readSymbol, curvatureHeader,')
    signature = 'export function decodeCounted(image: ImageLike, options: DecodeOptions = {}, work?: Work, workspace?: DecodeWorkspace): DecodeResult | undefined {'
    replace(signature, signature + '''
  __peerPending = undefined
  const hook = (globalThis as typeof globalThis & {__qrVersionPeerTrace?: PeerHook}).__qrVersionPeerTrace
  __peerState = hook ? { hook, observations: [], attempts: [] } : undefined
  try {
    const result = __peerDecodeCounted(image, options, work, workspace)
    if (result) __peerPending = undefined
    __peerState?.hook({kind:'decode-end',read:result !== undefined,pending:__peerPending !== undefined})
    return result
  } catch (error) {
    __peerPending = undefined
    throw error
  } finally {
    __peerState = undefined
  }
}

function __peerDecodeCounted(image: ImageLike, options: DecodeOptions = {}, work?: Work, workspace?: DecodeWorkspace): DecodeResult | undefined {''')
    replace('  return recoverOrdinaryCurvature(luminance, inverse, budget, inverseCurvature, work)\n}', '''  const terminal = recoverOrdinaryCurvature(luminance, inverse, budget, inverseCurvature, work)
  __peerFinish(luminance, inverse, budget, !terminal)
  return terminal
}''')
    old = 'if (curvature) keepCurvature(curvature, location, inverted, sample, conflictBudget, inverseLuminance)'
    replace(old, 'if (curvature) { __peerCollect(image, location, inverted, inverseLuminance); keepCurvature(curvature, location, inverted, sample, conflictBudget, inverseLuminance) }', 2)
    calls = [
        ('secondLook(luminance, levels, candidate, work, strict, false, meshCollector(budget, candidate, f, publicInverse))', "__peerSecond('look', f, publicInverse, luminance, levels, candidate, work, strict, false, meshCollector(budget, candidate, f, publicInverse))", 1),
        ('secondLook(luminance, levels, candidate, work, true, false, meshCollector(budget, candidate, 1))', "__peerSecond('version-or-overflow', 1, false, luminance, levels, candidate, work, true, false, meshCollector(budget, candidate, 1))", 2),
        ('secondLook(luminance, levels, candidate, work, true, true, meshCollector(budget, candidate, 1, publicInverse))', "__peerSecond('curvature', 1, publicInverse, luminance, levels, candidate, work, true, true, meshCollector(budget, candidate, 1, publicInverse))", 1),
        ('secondLook(image, thresholds(image), candidate, work, true, true,', "__peerSecond('terminal', 1, inverseLuminance, image, thresholds(image), candidate, work, true, true,", 3),
    ]
    for old, new, count in calls:
        replace(old, new, count)
    text += '\n' + DECODE_HELPER
    symbol = original['symbol.ts'].decode() + '\n' + HEADER_HELPER
    refine = original['refine.ts'].decode()
    def refine_replace(old, new):
        nonlocal refine
        actual = refine.count(old)
        if actual != 1:
            raise ValueError(f'refine.ts: expected one match, found {actual}: {old[:160]!r}')
        refine = refine.replace(old, new)
        changes.append({'file':'refine.ts','needle':old,'count':1})
    # Exported only by this copied symbol module. The hook is installed solely
    # during off-path replay, never during the observed baseline decode.
    refine_replace('  const result = readSymbol(read, size)\n', '''  const result = readSymbol(read, size)
  const peerObserver = (globalThis as typeof globalThis & {
    __qrVersionPeerFinal?: (read:ModuleReader,size:number,ecc:Candidate['ecc'],mask:number,readable:boolean)=>void
  }).__qrVersionPeerFinal
  if (peerObserver) peerObserver(read,size,candidate.ecc,candidate.mask,result!==undefined)
''')
    for name, data in original.items():
        if (source / name).read_bytes() != data:
            raise RuntimeError('Source changed while copying: ' + name)
    dest.mkdir(parents=True)
    for name, data in original.items():
        out = dest / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(text.encode() if name == 'decode.ts' else symbol.encode() if name == 'symbol.ts' else refine.encode() if name == 'refine.ts' else data)
    identity = {'revision':revision,'instrumentSha256':sha(Path(__file__).read_bytes()),
                'sourceFiles':{name:sha(data) for name,data in original.items()},
                'copiedFiles':{name:sha((dest/name).read_bytes()) for name in original},
                'replacements':changes,'status':'observer only; baseline control and Work unchanged',
                'selection':'first actual full-size collection with exact size version, conflicting decoded version peer distance 3, both decoded formats agree, and no semantic matching actual attempt',
                'replay':'one strict late attempt plus strict direct mesh; separate Work; failure only; replay-only final-grid header evidence'}
    (dest/'identity.json').write_text(json.dumps(identity,indent=2)+'\n')
    print(json.dumps({'source':str(dest),'identity':str(dest/'identity.json')}))

HEADER_HELPER = r'''
/** Diagnostic only: independently decode both copies; no production cache. */
export function __qrPeerEvidence(read: ModuleReader, size: number) {
  if (size < 45 || (size - 17) % 4 !== 0) return undefined
  const closest = <T extends {bits:number}>(table: readonly T[], word:number) => {
    let entry=table[0]!, distance=popcount(entry.bits ^ word)
    for (const value of table) {
      const d=popcount(value.bits ^ word)
      if (d<distance) { entry=value; distance=d }
    }
    return { ...entry, word, distance, decoded:distance<=3 }
  }
  let va=0,vb=0,a=0,b=0
  for (let k=17;k>=0;k--) {
    const i=Math.floor(k/3),j=k%3
    va=(va<<1)|+read(i,size-11+j)
    vb=(vb<<1)|+read(size-11+j,i)
  }
  for (let i=14;i>=0;i--) {
    const [x,y]=FORMAT_COORDS[i]!
    a=(a<<1)|+read(x,y)
    b=(b<<1)|+read(i<8?size-1-i:8,i<8?8:size-7+i-8)
  }
  const v=(size-17)/4,expected=versionBits(v)
  const versions=[closest(VERSIONS,va),closest(VERSIONS,vb)]
  const formats=[closest(FORMATS,a),closest(FORMATS,b)]
  const versionPeer=(va===expected && versions[1]!.decoded && versions[1]!.version!==v && versions[1]!.distance===3) ||
    (vb===expected && versions[0]!.decoded && versions[0]!.version!==v && versions[0]!.distance===3)
  const formatAgreement=formats[0]!.decoded && formats[1]!.decoded && formats[0]!.bits===formats[1]!.bits
  return {sizeVersion:v,expectedVersionBits:expected,versions,formats,versionPeer,formatAgreement,
    eligible:versionPeer && formatAgreement}
}
'''

DECODE_HELPER = r'''
type PeerHook = (event:unknown)=>void
type PeerAttempt = {candidate:Candidate;factor:number;inverseBasis:boolean;phase:string;strict:boolean;late:boolean}
type PeerObservation = {candidate:Candidate;inverseBasis:boolean;evidence:NonNullable<ReturnType<typeof __qrPeerEvidence>>;index:number}
type PeerPending = {candidate:Candidate;inverseBasis:boolean;luminance:Luminance;index:number}
let __peerState:{hook:PeerHook;observations:PeerObservation[];attempts:PeerAttempt[]} | undefined
let __peerPending:PeerPending | undefined

function __peerMeta(candidate:Candidate,inverseBasis:boolean) {
  const {location,mirrored,inverted,ecc,mask,distance}=candidate
  return {size:location.size,mirrored,inverted,ecc,mask,distance,basis:inverseBasis?'inverse-luminance':'original',
    publicInverted:inverseBasis||inverted,matrix:location.matrix?Array.from(location.matrix):null}
}
function __peerSame(a:PeerAttempt,c:Candidate,inverseBasis:boolean):boolean {
  if(a.factor!==1||a.inverseBasis!==inverseBasis)return false
  const p=a.candidate, m=p.location.matrix, n=c.location.matrix
  return p.location.size===c.location.size&&p.mirrored===c.mirrored&&p.inverted===c.inverted&&
    p.ecc===c.ecc&&p.mask===c.mask&&!!m&&!!n&&m.length===n.length&&m.every((v,i)=>v===n[i])
}
function __peerCollect(image:BitImage,location:Location,inverted:boolean,inverseBasis:boolean):void {
  const state=__peerState
  if(!state||!location.matrix)return
  const at:ModuleReader=(x,y)=>{
    const p=location.project(x,y),px=Math.floor(p.x),py=Math.floor(p.y)
    return px>=0&&py>=0&&px<image.width&&py<image.height&&image.data[py*image.width+px]===1
  }
  for(const mirrored of [false,true]){
    const evidence=__qrPeerEvidence(mirrored?(x,y)=>at(y,x):at,location.size)
    if(!evidence)continue
    const first=evidence.formats[0]!
    const candidate:Candidate={location,inverted,mirrored,ecc:first.ecc,mask:first.mask,
      distance:Math.min(first.distance,evidence.formats[1]!.distance)}
    state.hook({kind:'collection-evidence',candidate:__peerMeta(candidate,inverseBasis),evidence})
    if(evidence.eligible)state.observations.push({candidate,inverseBasis,evidence,index:state.observations.length})
  }
}
function __peerSecond(phase:string,factor:number,inverseBasis:boolean,...args:Parameters<typeof secondLook>):Payload|undefined {
  const state=__peerState
  if(state){
    const candidate=args[2],strict=args[4]??false,late=args[5]??false
    state.attempts.push({candidate,factor,inverseBasis,phase,strict,late})
    state.hook({kind:'second-attempt',phase,factor,strict,late,candidate:__peerMeta(candidate,inverseBasis)})
  }
  return secondLook(...args)
}
function __peerFinish(luminance:Luminance,inverse:Luminance|undefined,budget:Budget,failed:boolean):void {
  const state=__peerState
  if(!state)return
  const observations=state.observations.map(item=>{
    const matches=state.attempts.filter(a=>__peerSame(a,item.candidate,item.inverseBasis))
    const image=item.inverseBasis?inverse:luminance
    const selected=failed&&!__peerPending&&matches.length===0&&!!image
    if(selected)__peerPending={candidate:item.candidate,inverseBasis:item.inverseBasis,luminance:image!,index:item.index}
    return {index:item.index,candidate:__peerMeta(item.candidate,item.inverseBasis),evidence:item.evidence,
      attempted:matches.length>0,selected,matchingAttempts:matches.map(a=>({phase:a.phase,factor:a.factor,strict:a.strict,late:a.late}))}
  })
  state.hook({kind:'final-eligible',failed,remainingMaps:budget.maps,remainingSecond:budget.second,
    attempts:state.attempts.length,observations})
}
/** One consumed-once counterfactual after complete baseline failure. */
export function __qrReplayVersionPeer() {
  const pending=__peerPending;__peerPending=undefined
  if(!pending)return undefined
  const {candidate,inverseBasis,luminance,index}=pending
  const work:Work={steps:0,compared:0,scanned:0,maps:0,second:1,meshes:0,probed:0,reduced:0}
  const headers:unknown[]=[]
  const globals=globalThis as typeof globalThis & {
    __qrVersionPeerFinal?: (read:ModuleReader,size:number,ecc:Candidate['ecc'],mask:number,readable:boolean)=>void
  }
  const previous=globals.__qrVersionPeerFinal
  globals.__qrVersionPeerFinal=(read,size,ecc,mask,readable)=>{
    headers.push({stage:'refined',evidence:__qrPeerEvidence(read,size),symbolReadable:readable,
      strictFormat:formatAgrees(read,size,ecc,mask)})
  }
  let grid:Uint8Array|undefined,result:DecodeResult|undefined,stage='miss'
  let payload:Payload|undefined
  try {
    payload=secondLook(luminance,thresholds(luminance),candidate,work,true,true,modules=>{grid=modules})
  } finally {
    if(previous===undefined)delete globals.__qrVersionPeerFinal
    else globals.__qrVersionPeerFinal=previous
  }
  const inverted=inverseBasis||candidate.inverted,location=where(candidate.location,1)
  if(payload){result={...payload,mirrored:candidate.mirrored,inverted,location};stage='refined'}
  else if(grid){
    const modules=grid,size=candidate.location.size
    const read:ModuleReader=candidate.mirrored?(x,y)=>modules[x*size+y]===1:(x,y)=>modules[y*size+x]===1
    const strictFormat=formatAgrees(read,size,candidate.ecc,candidate.mask)
    const observation={stage:'mesh',evidence:__qrPeerEvidence(read,size),strictFormat,symbolReadable:false}
    headers.push(observation)
    if(strictFormat){
      const decoded=readSymbol(read,size)
      observation.symbolReadable=decoded!==undefined
      if(decoded&&decoded.ecc===candidate.ecc&&decoded.mask===candidate.mask){
        result={...decoded,mirrored:candidate.mirrored,inverted,location};stage='mesh'
      }
    }
  }
  return {index,candidate:__peerMeta(candidate,inverseBasis),result,work,stage,headers}
}
'''

if __name__ == '__main__':
    main()
