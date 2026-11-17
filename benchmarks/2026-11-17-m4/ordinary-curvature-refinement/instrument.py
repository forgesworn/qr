#!/usr/bin/env python3
"""Copy 0.3.8 sources and observe ordinary-only retained refinement candidates.

Usage: python3 instrument.py ROOT NEW_OUTSRC
No build, tests or decoding. Only copied decode.ts/refine.ts change.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

BASELINE = '29c18aa8c63df53ced3d08ed4dbd0fa1f876905d'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    root, dest = (Path(arg).resolve() for arg in sys.argv[1:])
    source = root / 'src'
    if dest.exists() or dest == source or source in dest.parents:
        raise ValueError('Destination must be new and outside ROOT/src')
    revision = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if revision != BASELINE:
        raise ValueError('Expected released 0.3.8 revision ' + BASELINE)
    original = {str(p.relative_to(source)): p.read_bytes() for p in sorted(source.rglob('*')) if p.is_file()}
    texts = {name: original[name].decode() for name in ['decode.ts', 'refine.ts']}
    replacements = []

    def replace(name, old, new, count=1):
        actual = texts[name].count(old)
        if actual != count:
            raise ValueError(f'{name}: expected {count} matches, got {actual}: {old[:160]!r}')
        texts[name] = texts[name].replace(old, new)
        replacements.append({'file': name, 'needle': old, 'count': count})

    signature = 'export function decodeCounted(image: ImageLike, options: DecodeOptions = {}, work?: Work, workspace?: DecodeWorkspace): DecodeResult | undefined {'
    replace('decode.ts', signature, signature + '''
  __latePending = undefined
  const hook = (globalThis as typeof globalThis & {__qrLatePhaseTrace?: LateHook}).__qrLatePhaseTrace
  __lateState = hook ? { hook, attempts: [] } : undefined
  try {
    const result = __lateDecodeCounted(image, options, work, workspace)
    if (result) __latePending = undefined
    __lateState?.hook({kind:'decode-end',read:result !== undefined,pending:__latePending !== undefined})
    return result
  } catch (error) {
    __latePending = undefined
    throw error
  } finally {
    __lateState = undefined
  }
}

function __lateDecodeCounted(image: ImageLike, options: DecodeOptions = {}, work?: Work, workspace?: DecodeWorkspace): DecodeResult | undefined {''')
    replace('decode.ts', '  return recoverHeaderConflict(luminance, inverse, budget, work)\n}', '''  const conflict = recoverHeaderConflict(luminance, inverse, budget, work)
  __lateFinish(luminance, inverse, budget, inverseCurvature, !conflict)
  return conflict
}''')
    calls = [
        ('secondLook(luminance, levels, candidate, work, strict, false, meshCollector(budget, candidate, f, publicInverse))', "__lateSecond('search', f, publicInverse, luminance, levels, candidate, work, strict, false, meshCollector(budget, candidate, f, publicInverse))", 1),
        ('secondLook(luminance, levels, candidate, work, true, false, meshCollector(budget, candidate, 1))', "__lateSecond('version-or-overflow', 1, false, luminance, levels, candidate, work, true, false, meshCollector(budget, candidate, 1))", 2),
        ('secondLook(luminance, levels, candidate, work, true, true, meshCollector(budget, candidate, 1, publicInverse))', "__lateSecond('curvature', 1, publicInverse, luminance, levels, candidate, work, true, true, meshCollector(budget, candidate, 1, publicInverse))", 1),
        ('      const payload = secondLook(image, thresholds(image), candidate, work, true, true,', "      const payload = __lateSecond('terminal-fifth', 1, inverseLuminance, image, thresholds(image), candidate, work, true, true,", 1),
        ('  const payload = secondLook(image, thresholds(image), candidate, work, true, true,', "  const payload = __lateSecond('terminal-conflict', 1, inverseLuminance, image, thresholds(image), candidate, work, true, true,", 1),
    ]
    for old, new, count in calls:
        replace('decode.ts', old, new, count)
    texts['decode.ts'] += '\n' + HELPERS

    replace('refine.ts', '  if (found === 0) return undefined\n  if (work) work.meshes++', '''  const observe = (globalThis as typeof globalThis & {__qrLateMeshTrace?: (event:unknown)=>void}).__qrLateMeshTrace
  if (observe) observe({kind:'mesh-nodes',size,late,found,c:Array.from(c),state:Array.from(state),
    ox:Array.from(ox),oy:Array.from(oy),originalPoints:c.flatMap(y=>c.map(x=>project(x,y)))})
  if (found === 0) return undefined
  if (work) work.meshes++''')
    replace('refine.ts', '  const result = readSymbol(read, size)\n  if (result !== undefined', '''  const result = readSymbol(read, size)
  const observe = (globalThis as typeof globalThis & {__qrLateMeshTrace?: (event:unknown)=>void}).__qrLateMeshTrace
  if (observe) observe({kind:'final-read',size,late,meshed:meshed!==undefined,
    payloadReadable:result!==undefined,headerMatches:result!==undefined && result.ecc===candidate.ecc && result.mask===candidate.mask,
    strictFormat:formatAgrees(read,size,candidate.ecc,candidate.mask)})
  if (result !== undefined''')
    # The observation is after node updates, not a duplicated alignment search.
    replace('refine.ts', '''        state[i] = 3
      }
    }
  }
  const observe''', '''        state[i] = 3
      }
      const nodeHook = (globalThis as typeof globalThis & {__qrLateMeshTrace?: (event:unknown)=>void}).__qrLateMeshTrace
      if (nodeHook) nodeHook({kind:'mesh-node',size,late,pass,index:i,q,r,predictedX:px,predictedY:py,
        best,spread,centreX:mx/QUARTER,centreY:my/QUARTER,state:state[i],offsetX:ox[i],offsetY:oy[i]})
    }
  }
  const observe''')
    for name, data in original.items():
        if (source / name).read_bytes() != data:
            raise RuntimeError('Source changed while copying: ' + name)
    dest.mkdir(parents=True)
    for name, data in original.items():
        out = dest / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(texts[name].encode() if name in texts else data)
    identity = {
        'diagnostic': 'ordinary-versus-late-retained-candidate', 'revision': revision,
        'instrumentSha256': sha(Path(__file__).read_bytes()),
        'sourceFiles': {name: sha(data) for name, data in original.items()},
        'copiedFiles': {name: sha((dest / name).read_bytes()) for name in original},
        'replacements': replacements,
        'selection': 'first final original-then-inverse curvature candidate with same-matrix ordinary attempt and no late attempt; complete failure only; no ground truth',
        'replay': 'one candidate, strict ordinary and strict late controls, separate Work and direct-mesh strict validation; no production budget change',
        'notes': ['All six actual second-look sites are observed',
                  'The strict ordinary control can differ from an original non-strict ordinary attempt',
                  'Node and final-read observations only run during off-path replays',
                  'Never benchmark this observer build'],
    }
    (dest / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    print(json.dumps({'source': str(dest), 'identity': str(dest / 'identity.json')}))


HELPERS = r'''
type LateHook = (event: unknown) => void
type LateAttempt = {candidate:Candidate;factor:number;inverseBasis:boolean;strict:boolean;late:boolean;phase:string}
type LatePending = {candidate:Candidate;luminance:Luminance;inverseBasis:boolean}
let __lateState: {hook:LateHook;attempts:LateAttempt[]} | undefined
let __latePending: LatePending | undefined

function __lateMeta(candidate:Candidate, factor:number, inverseBasis:boolean) {
  const {location,mirrored,inverted,ecc,mask,distance}=candidate
  return {size:location.size,mirrored,inverted,ecc,mask,distance,factor,
    basis:inverseBasis?'inverse-luminance':'original',publicInverted:inverseBasis||inverted,
    matrix:location.matrix?Array.from(location.matrix):null,
    finders:[location.topLeft,location.topRight,location.bottomLeft].map(p=>({x:p.x,y:p.y}))}
}
function __lateSame(a:LateAttempt,candidate:Candidate,inverseBasis:boolean):boolean {
  if(a.factor!==1||a.inverseBasis!==inverseBasis)return false
  const c=a.candidate, matrix=c.location.matrix, other=candidate.location.matrix
  return c.location.size===candidate.location.size&&c.inverted===candidate.inverted&&
    c.mirrored===candidate.mirrored&&c.ecc===candidate.ecc&&c.mask===candidate.mask&&
    !!matrix&&!!other&&matrix.length===other.length&&matrix.every((v,i)=>v===other[i])
}
function __lateSecond(phase:string,factor:number,inverseBasis:boolean,...args:Parameters<typeof secondLook>):Payload|undefined {
  const state=__lateState
  if(state){
    const candidate=args[2],strict=args[4]??false,late=args[5]??false
    state.attempts.push({candidate,factor,inverseBasis,strict,late,phase})
    state.hook({kind:'second-attempt',phase,strict,late,candidate:__lateMeta(candidate,factor,inverseBasis)})
  }
  return secondLook(...args)
}
function __lateFinish(luminance:Luminance,inverse:Luminance|undefined,budget:Budget,inverseQueue:Candidate[]|undefined,failed:boolean):void {
  const state=__lateState
  if(!state)return
  const retained=[]
  for(const inverseBasis of [false,true]){
    const image=inverseBasis?inverse:luminance,queue=inverseBasis?inverseQueue:budget.curvature
    if(!image||!queue)continue
    for(const candidate of queue){
      const matches=state.attempts.filter(a=>__lateSame(a,candidate,inverseBasis))
      const ordinaryAttempted=matches.some(a=>!a.late),lateAttempted=matches.some(a=>a.late)
      const eligible=!!candidate.location.matrix&&ordinaryAttempted&&!lateAttempted
      const selected=failed&&!__latePending&&eligible
      if(selected)__latePending={candidate,luminance:image,inverseBasis}
      retained.push({...__lateMeta(candidate,1,inverseBasis),ordinaryAttempted,lateAttempted,eligible,selected,
        matchingAttempts:matches.map(a=>({phase:a.phase,strict:a.strict,late:a.late}))})
    }
  }
  state.hook({kind:'final-retained',failed,remainingSecond:budget.second,remainingMaps:budget.maps,
    actualAttempts:state.attempts.length,retained})
}

/** A consumed-once diagnostic comparison; never part of production decoding. */
export function __qrReplayLatePhase() {
  const pending=__latePending;__latePending=undefined
  if(!pending)return undefined
  const {candidate,luminance,inverseBasis}=pending
  const globals=globalThis as typeof globalThis & {__qrLateMeshTrace?:LateHook}
  const previous=globals.__qrLateMeshTrace
  const run=(late:boolean)=>{
    const events:unknown[]=[],work:Work={steps:0,compared:0,scanned:0,maps:0,second:1,meshes:0,probed:0,reduced:0}
    let modules:Uint8Array|undefined,result:DecodeResult|undefined,stage='miss'
    globals.__qrLateMeshTrace=event=>events.push(event)
    const payload=secondLook(luminance,thresholds(luminance),candidate,work,true,late,grid=>{modules=grid})
    const inverted=inverseBasis||candidate.inverted,location=where(candidate.location,1)
    if(payload){result={...payload,mirrored:candidate.mirrored,inverted,location};stage='refined'}
    else if(modules){
      const grid=modules,size=candidate.location.size
      const read:ModuleReader=candidate.mirrored?(x,y)=>grid[x*size+y]===1:(x,y)=>grid[y*size+x]===1
      const strictFormat=formatAgrees(read,size,candidate.ecc,candidate.mask)
      const decoded=strictFormat?readSymbol(read,size):undefined
      const headerMatches=decoded!==undefined&&decoded.ecc===candidate.ecc&&decoded.mask===candidate.mask
      events.push({kind:'direct-mesh-read',size,late,strictFormat,payloadReadable:decoded!==undefined,headerMatches})
      if(decoded&&headerMatches){result={...decoded,mirrored:candidate.mirrored,inverted,location};stage='mesh'}
    }
    return {result,work,stage,events}
  }
  try{return {candidate:__lateMeta(candidate,1,inverseBasis),ordinary:run(false),late:run(true)}}
  finally{
    if(previous===undefined)delete globals.__qrLateMeshTrace
    else globals.__qrLateMeshTrace=previous
  }
}
'''


if __name__ == '__main__':
    main()
