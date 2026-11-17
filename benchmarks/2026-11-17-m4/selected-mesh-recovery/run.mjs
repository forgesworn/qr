import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {framesFor as frames96} from './frames96.mjs'
import {framesFor as frames128} from './frames128.mjs'
import {framesFor as previous128} from './frames-previous128.mjs'
import {framesFor as holdout128} from './frames-holdout.mjs'
import {framesFor as previousFresh} from './frames-previous-fresh.mjs'
import {framesFor as versionPeerFresh} from './frames-fresh.mjs'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {framesFor as alternateFresh} from './frames-next-fresh.mjs'
import {framesFor as headerFresh} from './frames-validation.mjs'

if(process.argv.length!==7)throw Error('Usage: node run.mjs ROOT EXACT_BASELINE_COMMIT BUILD RIVALS NEW_RESULT_JSON')
const [rootArg,baselineRevision,buildArg,rivalsArg,outArg]=process.argv.slice(2)
const [root,build,rivals,out]=[rootArg,buildArg,rivalsArg,outArg].map(p=>resolve(p))
assert.equal(existsSync(out),false,'Refusing an existing result path before any decoding')
assert.equal(baselineRevision,'0fdcd6262f0cd5ddcd7ec6bfba5d131df01c9a37')
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),baselineRevision)
const sha=x=>createHash('sha256').update(x).digest('hex')
const json=p=>JSON.parse(readFileSync(p))
const load=p=>import(pathToFileURL(p).href)
const evidence=root+'/benchmarks/2026-11-17-m4/header-rediscovery'
const receiptPath=evidence+'/production-qualified.json',receipt=json(receiptPath)
assert.equal(receipt.passed,true)
const identity=json(build+'/identity.json')
assert.equal(identity.instrument.revision,baselineRevision)
assert.equal(identity.instrument.instrumentSha256,sha(readFileSync(new URL('./instrument.py',import.meta.url))))
assert.equal(identity.instrument.expectedSourcesSha256,sha(readFileSync(new URL('./expected-sources.json',import.meta.url))))
assert.equal(identity.builderSha256,sha(readFileSync(new URL('./build.cjs',import.meta.url))))
assert.equal(identity.typechecked,true)
assert.equal(identity.compiler,createRequire(root+'/package.json')('typescript/package.json').version)
assert.equal(identity.tsconfigSha256,sha(readFileSync(root+'/tsconfig.json')))
assert.deepEqual(Object.keys(identity.generated).sort(),Object.keys(identity.instrument.copiedFiles).sort())
assert.deepEqual(readdirSync(build+'/public').filter(n=>n.endsWith('.js')).sort(),Object.keys(identity.generated).map(n=>n.replace(/\.ts$/,'.js')).sort())
assert.deepEqual(identity.instrument.sourceFiles,receipt.identity.sources.public,'Final source differs from released qualified source')
for(const [name,hash] of Object.entries(identity.instrument.sourceFiles))
  assert.equal(sha(readFileSync(root+'/src/'+name)),hash,'Root source drift '+name)
for(const [name,hash] of Object.entries(identity.generated))
  assert.equal(sha(readFileSync(build+'/public/'+name.replace(/\.ts$/,'.js'))),hash,'Observer JS drift '+name)
const releasedJs=receipt.identity.generated.public
assert.deepEqual(Object.keys(releasedJs).sort(),Object.keys(identity.instrument.sourceFiles).filter(name=>name.endsWith('.ts')).sort(),
  'Released JavaScript/source module set differs')
assert.deepEqual(readdirSync(root+'/dist').filter(name=>name.endsWith('.js')).sort(),
  Object.keys(releasedJs).map(name=>name.replace(/\.ts$/,'.js')).sort(),'Baseline JavaScript module set differs')
for(const [name,hash] of Object.entries(releasedJs))
  assert.equal(sha(readFileSync(root+'/dist/'+name.replace(/\.ts$/,'.js'))),hash,'Baseline JavaScript differs from released qualification '+name)

const groups=[
  {name:'known96',generate:frames96,file:'frames96.mjs',manifest:root+'/benchmarks/2026-11-16-m4/mesh-boundary-continuation/fresh-manifest.json'},
  {name:'known128',generate:frames128,file:'frames128.mjs',manifest:root+'/benchmarks/2026-11-16-m4/deferred-mesh-reading/new128-manifest.json'},
  {name:'previous128',generate:previous128,file:'frames-previous128.mjs',manifest:root+'/benchmarks/2026-11-17-m4/starved-curvature-recovery/holdout-manifest.json'},
  {name:'holdout128',generate:holdout128,file:'frames-holdout.mjs',manifest:root+'/benchmarks/2026-11-17-m4/conflicting-format-recovery/holdout-manifest.json'},
  {name:'fresh128',generate:previousFresh,file:'frames-previous-fresh.mjs',manifest:root+'/benchmarks/2026-11-17-m4/ordinary-curvature-refinement/fresh-manifest.json'},
  {name:'versionPeerFresh128',generate:versionPeerFresh,file:'frames-fresh.mjs',manifest:root+'/benchmarks/2026-11-17-m4/version-peer-recovery/fresh-manifest.json'},
  {name:'alternateGridFresh128',generate:alternateFresh,file:'frames-next-fresh.mjs',manifest:root+'/benchmarks/2026-11-17-m4/alternate-grid-recovery/fresh-manifest.json'},
  {name:'headerRediscoveryFresh128',generate:headerFresh,file:'frames-validation.mjs',manifest:evidence+'/validation-manifest.json'},
]
const targetIds=new Set(['boundary-unseen-95','starvation-holdout-42','alternate-grid-holdout-125'])
const gainIds=new Set(['starvation-holdout-54','starvation-holdout-78','starvation-holdout-122',
  'admission-holdout-78','admission-holdout-122','late-phase-holdout-6','version-peer-holdout-54',
  'version-peer-holdout-87','alternate-grid-holdout-78','alternate-grid-holdout-99','header-rediscovery-holdout-54'])
const curated={known96:[16,32,74,87],known128:[32,73,76,90,120,122],previous128:[40]}
const selectedCases=[]
for(const g of groups){
  g.frames=g.generate(rivals)
  assert.deepEqual(g.frames.map(f=>f.meta),json(g.manifest).cases,'Frozen inputs changed '+g.name)
  g.receipt=receipt.suites.find(s=>s.name===g.name)
  assert.ok(g.receipt,'Missing suite '+g.name)
  for(const index of curated[g.name]??[]){
    const row=g.receipt.rows.find(r=>r.id.endsWith('-'+index))
    assert.ok(row,'Missing declared control '+g.name+'/'+index)
    assert.equal(row.readers.candidate.status,'correct','Control is not a released success '+row.id)
  }
  for(const f of g.frames){
    const old=g.receipt.rows.find(r=>r.id===f.meta.id)
    assert.ok(old,'Missing released frame '+f.meta.id)
    const target=targetIds.has(f.meta.id),gain=gainIds.has(f.meta.id)
    const control=(curated[g.name]??[]).some(i=>f.meta.id.endsWith('-'+i))
    if(!target&&!gain&&!control)continue
    if(target){assert.equal(old.readers.candidate.status,'miss');assert.equal(old.readers.zxing.status,'correct')}
    else assert.equal(old.readers.candidate.status,'correct')
    if(gain)assert.equal(old.readers.base.status,'miss','Declared 0.3.12 gain was already read '+f.meta.id)
    selectedCases.push({g,f,old,role:target?'selected-header-miss':gain?'0.3.12-gain-control':'prior-success-control'})
  }
}
assert.equal(selectedCases.filter(c=>c.role==='selected-header-miss').length,3)
assert.equal(selectedCases.filter(c=>c.role==='0.3.12-gain-control').length,11)
assert.equal(selectedCases.filter(c=>c.role==='prior-success-control').length,11)
assert.equal(new Set(selectedCases.map(c=>c.f.meta.id)).size,25)
const baseline=await load(root+'/dist/decode.js'),observed=await load(build+'/public/decode.js'),rows=[]
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
const status=(result,f)=>!result?'miss':result.text===f.text&&Buffer.from(result.bytes).equals(Buffer.from(f.text,'utf8'))?'correct':'wrong'
const summarise=result=>result&&({...result,text:undefined,bytes:undefined,textSha256:sha(result.text),bytesSha256:sha(result.bytes)})
const safeEvent=e=>{
  const {meshGrid,finalGrid,...rest}=e
  return {...rest,...(meshGrid?{meshBytes:meshGrid.length,meshSha256:sha(meshGrid)}:{}),
    ...(finalGrid?{finalBytes:finalGrid.length,finalSha256:sha(finalGrid)}:{})}
}
const checkPixels=f=>assert.equal(sha(f.image.data),f.meta.pixelSha256,'Changed pixels '+f.meta.id)
assert.equal(globalThis.__qrSelectedMeshTrace,undefined)
assert.equal(globalThis.__qrSelectedMeshCapture,undefined)
const resetSuccess=selectedCases.find(c=>c.role==='prior-success-control')
assert.ok(resetSuccess)
let resetControl
for(const {g,f,old,role} of selectedCases){
  const baselineWork=work(),offWork=work(),traceWork=work(),events=[]
  checkPixels(f)
  const before=baseline.decodeCounted(f.image,{},baselineWork)
  checkPixels(f)
  assert.equal(status(before,f),old.readers.candidate.status,'Baseline outcome drift '+f.meta.id)
  assert.deepEqual(baselineWork,old.readers.candidate.work,'Baseline Work drift '+f.meta.id)
  const off=observed.decodeCounted(f.image,{},offWork)
  checkPixels(f)
  assert.deepEqual(off,before,'Disabled observer changed full result '+f.meta.id)
  assert.deepEqual(offWork,baselineWork,'Disabled observer changed Work '+f.meta.id)
  assert.equal(observed.__qrReplaySelectedMesh(),undefined,'Disabled observer retained replay')
  let after
  globalThis.__qrSelectedMeshTrace=event=>events.push(safeEvent(event))
  try{after=observed.decodeCounted(f.image,{},traceWork)}
  finally{delete globalThis.__qrSelectedMeshTrace}
  checkPixels(f)
  assert.deepEqual(after,before,'Enabled observer changed full result '+f.meta.id)
  assert.deepEqual(traceWork,baselineWork,'Enabled observer changed Work '+f.meta.id)
  assert.equal(globalThis.__qrSelectedMeshCapture,undefined,'Observer leaked mesh delivery hook')
  const selected=events.filter(e=>e.kind==='selected')
  assert.ok(selected.length<=1,'Observer selected more than production slot')
  for(const event of selected){
    const call=events.find(e=>e.kind==='late-attempt'&&e.index===event.index)
    assert.ok(call);assert.deepEqual(event.original,call.candidate)
    assert.equal(event.collectorPresent,call.collectorPresent)
    assert.equal(call.late,true);assert.equal(call.factor,1)
    assert.deepEqual(event.original.matrix,event.candidate.matrix)
    for(const key of ['size','inverted','basis','publicInverted'])assert.equal(event.original[key],event.candidate[key])
    assert.ok(['mirrored','ecc','mask'].some(k=>event.original[k]!==event.candidate[k]))
  }
  const replay=observed.__qrReplaySelectedMesh()
  assert.equal(observed.__qrReplaySelectedMesh(),undefined,'Replay must be consumed once')
  checkPixels(f)
  if(before)assert.equal(replay,undefined,'Successful decode retained replay')
  let replaySummary
  if(replay){
    const outcome=status(replay.result,f)
    assert.notEqual(outcome,'wrong','Wrong replay payload '+f.meta.id)
    assert.deepEqual(replay.work,work(),'Grid replay added decoder Work')
    assert.equal(replay.newImageSamples,0);assert.equal(replay.gridChecks,1)
    assert.equal(replay.symbolReads,replay.strictFormat?1:0)
    assert.equal(selected.length,1);assert.equal(selected[0].index,replay.index)
    assert.deepEqual(selected[0].candidate,replay.candidate)
    assert.deepEqual(selected[0].original,replay.original)
    const delivered=events.filter(e=>e.kind==='mesh-delivery'&&e.selected)
    assert.equal(delivered.length,1)
    assert.equal(delivered[0].index,replay.index)
    assert.equal(delivered[0].meshSha256,sha(replay.meshGrid))
    assert.equal(selected[0].collectorPresent,true)
    if(replay.result){
      assert.equal(replay.strictFormat,true)
      assert.equal(replay.result.version,f.meta.version)
      assert.equal(replay.result.inverted,f.meta.inverted)
      assert.equal(replay.result.mirrored,f.meta.mirrored??false)
      assert.equal(replay.result.ecc,replay.candidate.ecc);assert.equal(replay.result.mask,replay.candidate.mask)
    }
    const {meshGrid,...rest}=replay
    replaySummary={...rest,meshBytes:meshGrid.length,meshSha256:sha(meshGrid),status:outcome,result:summarise(replay.result)}
    if(!resetControl){
      // Leave a freshly prepared replay UNCONSUMED, then start another decode.
      // Exercise both a successful decode and a miss; neither may expose stale state.
      const resetRows=[]
      for(const next of [resetSuccess,{f,old}]){
        const preparedWork=work(),preparedEvents=[]
        globalThis.__qrSelectedMeshTrace=e=>preparedEvents.push(safeEvent(e))
        let prepared
        try{prepared=observed.decodeCounted(f.image,{},preparedWork)}
        finally{delete globalThis.__qrSelectedMeshTrace}
        assert.deepEqual(prepared,before);assert.deepEqual(preparedWork,baselineWork);checkPixels(f)
        assert.equal(preparedEvents.at(-1).pending,true,'Reset control did not prepare an unconsumed replay')
        const baseWork=work(),nextWork=work()
        checkPixels(next.f)
        const nextBefore=baseline.decodeCounted(next.f.image,{},baseWork)
        checkPixels(next.f)
        const nextAfter=observed.decodeCounted(next.f.image,{},nextWork)
        checkPixels(next.f)
        assert.deepEqual(nextAfter,nextBefore);assert.deepEqual(nextWork,baseWork)
        assert.equal(status(nextAfter,next.f),next.old.readers.candidate.status)
        assert.deepEqual(baseWork,next.old.readers.candidate.work)
        assert.equal(observed.__qrReplaySelectedMesh(),undefined,'New decode retained stale unconsumed replay')
        assert.equal(globalThis.__qrSelectedMeshCapture,undefined)
        resetRows.push({next:next.f.meta.id,status:status(nextAfter,next.f),passed:true})
      }
      resetControl={pendingFrom:f.meta.id,unconsumed:true,cases:resetRows}
    }
  }
  rows.push({...f.meta,group:g.name,role,baselineWork,baseline:summarise(before),events,replay:replaySummary})
  console.log(JSON.stringify({id:f.meta.id,role,selected:selected.length===1,meshDelivered:events.some(e=>e.kind==='mesh-delivery'&&e.selected),
    replayed:!!replaySummary,status:replaySummary?.status,strictFormat:replaySummary?.strictFormat}))
}
const summary={cases:rows.length,controls:rows.filter(r=>r.role!=='selected-header-miss').length,
  misses:rows.filter(r=>r.role==='selected-header-miss').length,replayed:rows.filter(r=>r.replay).length,
  recovered:rows.filter(r=>r.replay?.status==='correct').map(r=>r.id)}
if(summary.replayed)assert.ok(resetControl,'Unconsumed reset control missing')
writeFileSync(out,JSON.stringify({passed:true,baseline:baselineRevision,runnerSha256:sha(readFileSync(new URL(import.meta.url))),
  releasedReceiptSha256:sha(readFileSync(receiptPath)),baselineJavascript:releasedJs,
  inputs:groups.map(g=>({suite:g.name,generator:g.file,generatorSha256:sha(readFileSync(new URL(g.file,import.meta.url))),manifestSha256:sha(readFileSync(g.manifest))})),
  identity,summary,resetControl:resetControl??{notApplicable:'No delivered mesh was retained for any failed decode'},rows},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(summary))
