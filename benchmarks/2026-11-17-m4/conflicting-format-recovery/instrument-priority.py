#!/usr/bin/env python3
"""Copy released QR sources and add off-policy header/admission diagnostics.

Usage: python3 instrument-priority.py ROOT NEW_OUTSRC
No compiler, tests or decoder are executed. Only copied decode.ts/symbol.ts change.
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
    root, dest = (pathlib.Path(x).resolve() for x in sys.argv[1:])
    source = root / 'src'
    if dest.exists() or dest == source or source in dest.parents:
        raise SystemExit('NEW_OUTSRC must be new and outside ROOT/src')
    original = {str(p.relative_to(source)): p.read_bytes() for p in sorted(source.rglob('*')) if p.is_file()}
    text = original['decode.ts'].decode()
    replacements = []

    def replace(old, new, count=1):
        nonlocal text
        actual = text.count(old)
        if actual != count:
            raise RuntimeError(f'Expected {count}, found {actual}: {old[:180]!r}')
        text = text.replace(old, new)
        replacements.append({'needle': old, 'count': count})

    replace('import { agreedVersion, readSymbol, curvatureHeader,', 'import { __qrHeaderEvidence, agreedVersion, readSymbol, curvatureHeader,')
    replace('const MAX_TRIPLES = 6', DECODE_HELPERS + '\nconst MAX_TRIPLES = 6')
    replace('  const { width, height, stride, channels, inversion } = imageLayout(image, options)',
            '  __diagReset()\n  const { width, height, stride, channels, inversion } = imageLayout(image, options)')
    replace('  return recoverUnattemptedCurvature(luminance, inverse, budget, inverseCurvature, work)\n}', '''  const terminalResult = recoverUnattemptedCurvature(luminance, inverse, budget, inverseCurvature, work)
  __diagFinish(budget, inverseCurvature, !terminalResult)
  return terminalResult
}''')
    signature = "function look(luminance: Luminance, inversion: 'both' | 'normal' | 'inverted', f: number, budget: Budget, work?: Work, strictOverride = false, inverseCurvature?: Candidate[], publicInverse = false): DecodeResult | undefined {"
    replace(signature, signature + "\n  __diagContext = { phase: strictOverride ? 'inverse-search' : 'search', factor: f, basis: publicInverse ? 'inverse-luminance' : 'original' }; __diagLuminance = luminance")
    for name, phase in [('recoverVersion', 'version'), ('recoverOverflow', 'overflow')]:
        signature = f'function {name}(luminance: Luminance, budget: Budget, work?: Work): DecodeResult | undefined {{'
        replace(signature, signature + f"\n  __diagContext = {{ phase: '{phase}', factor: 1, basis: 'original' }}; __diagLuminance = luminance")
    signature = 'function recoverCurvature(luminance: Luminance, budget: Budget, work?: Work, candidates = budget.curvature, publicInverse = false): DecodeResult | undefined {'
    replace(signature, signature + "\n  __diagContext = { phase: 'curvature', factor: 1, basis: publicInverse ? 'inverse-luminance' : 'original' }; __diagLuminance = luminance")
    replace('  const { size, project, matrix } = location\n', '''  const { size, project, matrix } = location
  __diagMapBegin(image, location, inverted, strict, curvature !== undefined)
''')
    replace('  if (strict && !agreementRead(sample, size)) {', '''  if (strict && !agreementRead(sample, size)) {
    __diagEmit({ kind: 'read-decision', mapId: __diagCurrent?.id, reason: 'strict-format-rejected' })''')
    replace('    if (strict && !formatAgrees(straightRead, size, straight.ecc, straight.mask)) return undefined', '''    if (strict && !formatAgrees(straightRead, size, straight.ecc, straight.mask)) {
      __diagEmit({ kind:'read-decision', mapId:__diagCurrent?.id, reason:'decoded-straight-strict-format-rejected' })
      return undefined
    }''')
    replace('    if (strict && !formatAgrees(mirroredRead, size, mirrored.ecc, mirrored.mask)) return undefined', '''    if (strict && !formatAgrees(mirroredRead, size, mirrored.ecc, mirrored.mask)) {
      __diagEmit({ kind:'read-decision', mapId:__diagCurrent?.id, reason:'decoded-mirrored-strict-format-rejected' })
      return undefined
    }''')
    replace('  if (agreed && sized(modules, size, agreed.mirrored)) keep(candidates, { location, inverted, ...agreed })', '''  const sizeAccepted = agreed ? sized(modules, size, agreed.mirrored) : false
  __diagEmit({ kind:'ordinary-decision', mapId:__diagCurrent?.id, agreed:agreed ?? null, sizeAccepted })
  if (agreed && sizeAccepted) __diagKeep(candidates, { location, inverted, ...agreed }, 'ordinary')''')
    signature = 'function keepCurvature(candidates: Candidate[], location: Location, inverted: boolean, sample: ModuleReader): void {'
    replace(signature, signature + '\n  __diagCollect(location, inverted)')
    replace('    if (!header) continue\n', '''    __diagEmit({ kind:'curvature-decision', mapId:__diagCurrent?.id, mirrored, header:header ?? null })
    if (!header) continue
''')
    replace('    if (!duplicate) keep(candidates, { location, inverted, mirrored, ...header })', '''    if (!duplicate) __diagKeep(candidates, { location, inverted, mirrored, ...header }, 'curvature')
    else __diagEmit({ kind:'duplicate', queue:'curvature', mapId:__diagCurrent?.id,
      candidate:__diagHook ? __diagCandidate({ location, inverted, mirrored, ...header }) : undefined })''')
    calls = [
        ('secondLook(luminance, levels, candidate, work, strict, false, meshCollector(budget, candidate, f, publicInverse))', 'strict', 'false', 1),
        ('secondLook(luminance, levels, candidate, work, true, false, meshCollector(budget, candidate, 1))', 'true', 'false', 2),
        ('secondLook(luminance, levels, candidate, work, true, true, meshCollector(budget, candidate, 1, publicInverse))', 'true', 'true', 1),
    ]
    for call, strict, late, count in calls:
        replace('    const result = ' + call,
                f'    __diagAttempt(candidate, {strict}, {late}, budget)\n    const result = ' + call, count)
    replace('      const payload = secondLook(image, thresholds(image), candidate, work, true, true,', '''      __diagContext = { phase:'terminal-fifth', factor:1, basis:inverseLuminance ? 'inverse-luminance' : 'original' }
      __diagAttempt(candidate, true, true, budget)
      const payload = secondLook(image, thresholds(image), candidate, work, true, true,''')
    # Overflow corner screens are counted maps too, although they never call read().
    replace('        const format = agreementRead(sample, probe.size)', '''        __diagMapBegin(image, probe, group.inverted, true, false, 'overflow-screen')
        const format = agreementRead(sample, probe.size)''')
    symbol = original['symbol.ts'].decode() + '\n' + HEADER_HELPER
    for name, data in original.items():
        if (source / name).read_bytes() != data:
            raise RuntimeError(f'Source changed while preparing: {name}')
    dest.mkdir(parents=True)
    for name, data in original.items():
        out = dest / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(text.encode() if name == 'decode.ts' else symbol.encode() if name == 'symbol.ts' else data)
    identity = {
        'diagnostic': 'header-format-conflict-priority-0.3.7',
        'root': str(root),
        'revision': subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip(),
        'instrumentSha256': sha(pathlib.Path(__file__).read_bytes()),
        'sourceFiles': {name: sha(data) for name, data in original.items()},
        'copiedFiles': {name: sha((dest / name).read_bytes()) for name in original},
        'replacements': replacements,
        'selection': 'actual full-resolution curvature collections with an exact matching version word and no decoded version conflict, both formats decoded but conflicting, unique stronger distance0to2 versus3; first unattempted distance0or1 candidate, otherwise first unattempted distance2 candidate; one replay only after complete failure',
        'replayLimit': 1,
        'notes': ['Observer probes are independent of production module caches and Work',
                  'Replay does not affect baseline Work or budgets; never time this module',
                  'Each header copy reports nearest distance even beyond the BCH decoding radius',
                  'No input payload, known version or expected result participates in selection'],
    }
    (dest / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    print(json.dumps({'source': str(dest), 'identity': str(dest / 'identity.json'), 'decodeSha256': sha(text.encode()), 'symbolSha256': sha(symbol.encode())}))


HEADER_HELPER = r'''
/** Diagnostic only: inspect both copies independently, including unreadable ones. */
export function __qrHeaderEvidence(read: ModuleReader, size: number) {
  const closest = <T extends {bits:number}>(table: readonly T[], word: number) => {
    let entry = table[0]!, distance = popcount(entry.bits ^ word)
    for (const value of table) {
      const d = popcount(value.bits ^ word)
      if (d < distance) { entry = value; distance = d }
    }
    return { ...entry, word, distance, decoded:distance <= 3 }
  }
  let a = 0, b = 0
  for (let i = 14; i >= 0; i--) {
    const [x,y] = FORMAT_COORDS[i]!
    a = (a << 1) | +read(x,y)
    b = (b << 1) | +read(i < 8 ? size-1-i : 8, i < 8 ? 8 : size-7+i-8)
  }
  const first = closest(FORMATS,a), second = closest(FORMATS,b)
  const format = first.decoded ? first : second.decoded ? second : undefined
  const formatsNonconflicting = !!format && !(first.decoded && second.decoded && first.bits !== second.bits)
  const bothFormatsStrict = first.decoded && second.decoded && first.bits === second.bits && Math.max(first.distance,second.distance) <= 2
  let va = 0, vb = 0
  if (size >= 45) for (let k = 17; k >= 0; k--) {
    const i = Math.floor(k/3), j = k%3
    va = (va << 1) | +read(i,size-11+j)
    vb = (vb << 1) | +read(size-11+j,i)
  }
  const version = (size-17)/4
  const versions = size < 45 ? null : [closest(VERSIONS,va),closest(VERSIONS,vb)]
  const expected = size < 45 ? null : versionBits(version)
  const exactVersionMatch = versions !== null && (va === expected || vb === expected)
  const versionPeersNonconflicting = versions !== null && versions.every(v => !v.decoded || v.version === version)
  const bothVersionsAgreeWithSize = versions !== null && versions.every(v => v.decoded && v.version === version)
  const curvatureEligible = exactVersionMatch && versionPeersNonconflicting && formatsNonconflicting
  const strongerFormat = first.distance < second.distance ? first : second
  const weakerFormat = first.distance < second.distance ? second : first
  const shadowEligible = exactVersionMatch && versionPeersNonconflicting && first.decoded && second.decoded &&
    first.bits !== second.bits && strongerFormat.distance <= 2 && weakerFormat.distance === 3
  const shadowReason = shadowEligible ? strongerFormat.distance <= 1 ? 'exact-version-format-conflict-strong-0or1-vs3' : 'exact-version-format-conflict-weak-2-vs3' : null
  const symbolVersion = readVersion(read,size)
  const ordinarySizeAllowed = symbolVersion === undefined || 17+4*symbolVersion === size
  const reason = size < 45 ? 'no-version-fields' : !exactVersionMatch ? 'no-exact-version-anchor' :
    !versionPeersNonconflicting ? 'version-peer-conflict' : !format ? 'no-readable-format' :
    !formatsNonconflicting ? 'format-peer-conflict' : 'eligible'
  return { sizeVersion:version, formats:[first,second], versions, expectedVersionBits:expected,
    exactVersionMatch, versionPeersNonconflicting, bothVersionsAgreeWithSize, formatsNonconflicting,
    bothFormatsStrict, ordinarySizeAllowed, ordinaryHeaderEligible:bothFormatsStrict && ordinarySizeAllowed,
    symbolVersion:symbolVersion ?? null, curvatureEligible, shadowEligible, shadowReason, reason,
    candidate:shadowEligible ? {ecc:strongerFormat.ecc,mask:strongerFormat.mask,distance:strongerFormat.distance} :
      format && formatsNonconflicting ? {ecc:format.ecc,mask:format.mask,distance:Math.min(first.distance,second.distance)} : null }
}
'''


DECODE_HELPERS = r'''
type DiagnosticContext = {phase:string;factor:number;basis:'original'|'inverse-luminance'}
type DiagnosticHook = (event:unknown) => void
type HeaderEvidence = ReturnType<typeof __qrHeaderEvidence>
type DiagnosticMap = {id:number;location:Location;inverted:boolean;context:DiagnosticContext;evidence:HeaderEvidence[];luminance:Luminance|undefined}
type DiagnosticReplay = {candidate:Candidate;context:DiagnosticContext;luminance:Luminance;mapId:number}
let __diagHook: DiagnosticHook | undefined
let __diagContext: DiagnosticContext = {phase:'start',factor:1,basis:'original'}
let __diagLuminance: Luminance | undefined
let __diagCurrent: DiagnosticMap | undefined
let __diagMapId = 0
let __diagAttempted = new Set<string>()
let __diagLateAttempted = new Set<string>()
let __diagShadow: DiagnosticReplay[] = []
let __diagPending: DiagnosticReplay | undefined

function __diagReset(): void {
  __diagPending = undefined; __diagCurrent = undefined; __diagLuminance = undefined
  __diagMapId = 0; __diagAttempted = new Set(); __diagLateAttempted = new Set(); __diagShadow = []
  __diagHook = (globalThis as typeof globalThis & {__qrStarvationTrace?:DiagnosticHook}).__qrStarvationTrace
  __diagContext = {phase:'start',factor:1,basis:'original'}
}
function __diagEmit(event:unknown):void { if (__diagHook) __diagHook(event) }

function __diagCandidate(candidate:Candidate, context = __diagContext) {
  const {location,mirrored,inverted,ecc,mask,distance} = candidate, size = location.size
  const matrix = location.matrix ? Array.from(location.matrix) : undefined
  const numbers = (values:readonly number[]) => values.map(value => String(value))
  const landmarks = matrix ? undefined : [0,(size-1)/2,size-1].flatMap(y => [0,(size-1)/2,size-1].map(x => {
    const p=location.project(x,y);return {x:p.x,y:p.y}
  }))
  const geometry = matrix ? ['matrix',numbers(matrix)] : ['landmarks',landmarks!.map(p=>numbers([p.x,p.y]))]
  const key = JSON.stringify([context.basis,context.factor,size,mirrored,inverted,ecc,mask,geometry])
  return {key,...context,size,mirrored,inverted,publicInverted:context.basis==='inverse-luminance'||inverted,
    ecc,mask,distance,matrix,landmarks,finders:[location.topLeft,location.topRight,location.bottomLeft].map(p=>({x:p.x,y:p.y}))}
}

function __diagMapBegin(image:BitImage,location:Location,inverted:boolean,strict:boolean,collectionAvailable:boolean,kind='read'):void {
  if (!__diagHook) return
  const at:ModuleReader = (x,y) => {
    const p=location.project(x,y), px=Math.floor(p.x),py=Math.floor(p.y)
    return px>=0&&py>=0&&px<image.width&&py<image.height&&image.data[py*image.width+px]===1
  }
  const evidence = [__qrHeaderEvidence(at,location.size),__qrHeaderEvidence((x,y)=>at(y,x),location.size)]
  const item:DiagnosticMap = {id:++__diagMapId,location,inverted,context:{...__diagContext},evidence,luminance:__diagLuminance}
  __diagCurrent=item
  for (let orientation=0;orientation<2;orientation++) {
    const header=evidence[orientation]!
    __diagEmit({kind:'map-evidence',mapId:item.id,mapKind:kind,...item.context,size:location.size,
      inverted,publicInverted:item.context.basis==='inverse-luminance'||inverted,mirrored:orientation===1,
      strict,collectionAvailable,matrix:location.matrix?Array.from(location.matrix):null,
      finders:[location.topLeft,location.topRight,location.bottomLeft].map(p=>({x:p.x,y:p.y})),...header})
  }
}

function __diagCollect(location:Location,inverted:boolean):void {
  if (!__diagHook) return
  const item=__diagCurrent
  if (!item || item.location!==location || item.inverted!==inverted) throw new Error('Diagnostic map/collector mismatch')
  __diagEmit({kind:'curvature-collection',mapId:item.id,...item.context})
  if (item.context.factor!==1 || !item.luminance || !location.matrix) return
  for (let orientation=0;orientation<2;orientation++) {
    const header=item.evidence[orientation]!
    if (!header.shadowEligible || !header.candidate) continue
    const candidate:Candidate={location,inverted,mirrored:orientation===1,...header.candidate}
    const key=__diagCandidate(candidate,item.context).key
    if (__diagShadow.some(previous=>__diagCandidate(previous.candidate,previous.context).key===key)) continue
    __diagShadow.push({candidate,context:item.context,luminance:item.luminance,mapId:item.id})
    __diagEmit({kind:'shadow-eligible',mapId:item.id,confidenceClass:candidate.distance<=1?'strong':'weak',candidate:__diagCandidate(candidate,item.context)})
  }
}

function __diagKeep(list:Candidate[],candidate:Candidate,queue:string):void {
  if (!__diagHook) {keep(list,candidate);return}
  const before=list.slice();keep(list,candidate)
  __diagEmit({kind:'admission',mapId:__diagCurrent?.id,queue,candidate:__diagCandidate(candidate),
    retained:list.includes(candidate),index:list.indexOf(candidate),
    evicted:before.filter(c=>!list.includes(c)).map(c=>__diagCandidate(c)),retainedQueue:list.map(c=>__diagCandidate(c))})
}
function __diagAttempt(candidate:Candidate,strict:boolean,late:boolean,budget:Budget):void {
  if (!__diagHook) return
  const item=__diagCandidate(candidate);__diagAttempted.add(item.key)
  if(late)__diagLateAttempted.add(item.key)
  __diagEmit({kind:'second-attempt',candidate:item,strict,late,remainingSecond:budget.second,remainingMaps:budget.maps})
}
function __diagFinish(budget:Budget,inverseQueue:Candidate[]|undefined,failed:boolean):void {
  if(!__diagHook)return
  const retained=[]
  for(const [list,basis] of [[budget.curvature,'original'],[inverseQueue??[],'inverse-luminance']] as const) {
    for(const candidate of list) {
      const item=__diagCandidate(candidate,{phase:'curvature',factor:1,basis})
      retained.push({...item,attempted:__diagAttempted.has(item.key),lateAttempted:__diagLateAttempted.has(item.key)})
    }
  }
  const shadow=__diagShadow.map(item=>({mapId:item.mapId,...__diagCandidate(item.candidate,item.context),confidenceClass:item.candidate.distance<=1?'strong':'weak',attempted:__diagAttempted.has(__diagCandidate(item.candidate,item.context).key)}))
  if(failed) {
    const unattempted=(item:DiagnosticReplay)=>!__diagAttempted.has(__diagCandidate(item.candidate,item.context).key)
    __diagPending=__diagShadow.find(item=>item.candidate.distance<=1 && unattempted(item)) ??
      __diagShadow.find(item=>item.candidate.distance===2 && unattempted(item))
  }
  __diagEmit({kind:'final-retained',failed,remainingSecond:budget.second,remainingMaps:budget.maps,retained,shadow,
    selectedKey:__diagPending?__diagCandidate(__diagPending.candidate,__diagPending.context).key:null})
  __diagShadow=[];__diagCurrent=undefined;__diagLuminance=undefined
}

/** One independent diagnostic retry; never part of baseline execution. */
export function __qrReplayStarved() {
  const pending=__diagPending;__diagPending=undefined
  if(!pending)return undefined
  const {candidate,luminance,context,mapId}=pending
  const work:Work={steps:0,compared:0,scanned:0,maps:0,second:1,meshes:0,probed:0,reduced:0}
  let grid:Uint8Array|undefined
  const payload=secondLook(luminance,thresholds(luminance),candidate,work,true,true,modules=>{grid=modules})
  const inverted=context.basis==='inverse-luminance'||candidate.inverted,location=where(candidate.location,1)
  let result:DecodeResult|undefined,meshRead=false
  if(payload)result={...payload,mirrored:candidate.mirrored,inverted,location}
  else if(grid) {
    meshRead=true
    const modules=grid,size=candidate.location.size
    const read:ModuleReader=candidate.mirrored?(x,y)=>modules[x*size+y]===1:(x,y)=>modules[y*size+x]===1
    if(formatAgrees(read,size,candidate.ecc,candidate.mask)) {
      const decoded=readSymbol(read,size)
      if(decoded&&decoded.ecc===candidate.ecc&&decoded.mask===candidate.mask)result={...decoded,mirrored:candidate.mirrored,inverted,location}
    }
  }
  return {attempted:true,mapId,candidate:__diagCandidate(candidate,context),result,work,meshRead}
}
'''


if __name__ == '__main__':
    main()
