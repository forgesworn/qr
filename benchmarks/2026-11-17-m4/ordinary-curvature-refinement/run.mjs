import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {framesFor as frames96} from './frames96.mjs'
import {framesFor as frames128} from './frames128.mjs'
import {framesFor as previous128} from './frames-previous128.mjs'
import {framesFor as holdout128} from './frames-holdout.mjs'

if(process.argv.length!==6)throw Error('Usage: node run.mjs ROOT BUILD RIVALS NEW_RESULT_JSON')
const [root,build,rivals,out]=process.argv.slice(2).map(p=>resolve(p))
const sha=x=>createHash('sha256').update(x).digest('hex')
const json=p=>JSON.parse(readFileSync(p))
const load=p=>import(pathToFileURL(p).href)
const baselineRevision='29c18aa8c63df53ced3d08ed4dbd0fa1f876905d'
const evidence=root+'/benchmarks/2026-11-17-m4/conflicting-format-recovery'
const receiptPath=evidence+'/production-qualified.json',receipt=json(receiptPath)
assert.equal(receipt.passed,true)
const identity=json(build+'/identity.json')
assert.equal(identity.instrument.revision,baselineRevision)
for(const [name,hash] of Object.entries(identity.instrument.sourceFiles))
  assert.equal(sha(readFileSync(root+'/src/'+name)),hash,'Root source drift '+name)
for(const [name,hash] of Object.entries(identity.generated))
  assert.equal(sha(readFileSync(build+'/public/'+name.replace(/\.ts$/,'.js'))),hash,'Observer JS drift '+name)

const groups=[
  {name:'known96',generate:frames96,file:'frames96.mjs',manifest:root+'/benchmarks/2026-11-16-m4/mesh-boundary-continuation/fresh-manifest.json'},
  {name:'known128',generate:frames128,file:'frames128.mjs',manifest:root+'/benchmarks/2026-11-16-m4/deferred-mesh-reading/new128-manifest.json'},
  {name:'previous128',generate:previous128,file:'frames-previous128.mjs',manifest:root+'/benchmarks/2026-11-17-m4/starved-curvature-recovery/holdout-manifest.json'},
  {name:'holdout128',generate:holdout128,file:'frames-holdout.mjs',manifest:evidence+'/holdout-manifest.json'},
]
for(const g of groups){
  g.frames=g.generate(rivals)
  assert.deepEqual(g.frames.map(f=>f.meta),json(g.manifest).cases,'Frozen inputs changed '+g.name)
  g.receipt=receipt.suites.find(s=>s.name===g.name)
  assert.ok(g.receipt,'Missing suite '+g.name)
  g.misses=new Set(g.receipt.rows.filter(r=>r.readers.candidate.status==='miss'&&r.readers.zxing.status==='correct').map(r=>r.id))
  const correct=g.receipt.rows.filter(r=>r.readers.candidate.status==='correct')
  // First three established successes and first three newly gained successes,
  // fixed solely from the previous released qualification, never replay outcomes.
  g.controls=new Set([...correct.filter(r=>r.readers.base.status==='correct').slice(0,3),
    ...correct.filter(r=>r.readers.base.status==='miss').slice(0,3)].map(r=>r.id))
}
assert.equal(groups.reduce((n,g)=>n+g.misses.size,0),18,'Expected all 18 released ZX-only misses')
const baseline=await load(root+'/dist/decode.js'),observed=await load(build+'/public/decode.js'),rows=[]
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
const status=(result,f)=>!result?'miss':result.text===f.text&&Buffer.from(result.bytes).equals(Buffer.from(f.text,'utf8'))?'correct':'wrong'
const summarise=(result)=>result&&({...result,text:undefined,bytes:undefined,textSha256:sha(result.text),bytesSha256:sha(result.bytes)})
assert.equal(globalThis.__qrLatePhaseTrace,undefined)
assert.equal(globalThis.__qrLateMeshTrace,undefined)
for(const g of groups)for(const f of g.frames){
  if(!g.misses.has(f.meta.id)&&!g.controls.has(f.meta.id))continue
  const old=g.receipt.rows.find(r=>r.id===f.meta.id),baselineWork=work(),offWork=work(),traceWork=work(),events=[]
  const checkPixels=()=>assert.equal(sha(f.image.data),f.meta.pixelSha256,'Changed pixels '+f.meta.id)
  checkPixels()
  const before=baseline.decodeCounted(f.image,{},baselineWork)
  checkPixels()
  assert.equal(status(before,f),old.readers.candidate.status,'Released outcome drift '+f.meta.id)
  assert.deepEqual(baselineWork,old.readers.candidate.work,'Released Work drift '+f.meta.id)
  // The observer must be inert with its hook absent as well as observational
  // when enabled. This is correctness qualification, never a timing build.
  const off=observed.decodeCounted(f.image,{},offWork)
  checkPixels()
  assert.deepEqual(off,before,'Disabled observer changed result '+f.meta.id)
  assert.deepEqual(offWork,baselineWork,'Disabled observer changed Work '+f.meta.id)
  assert.equal(observed.__qrReplayLatePhase(),undefined,'Disabled observer retained a replay')
  let after
  globalThis.__qrLatePhaseTrace=event=>events.push(event)
  try{after=observed.decodeCounted(f.image,{},traceWork)}
  finally{delete globalThis.__qrLatePhaseTrace}
  checkPixels()
  assert.deepEqual(after,before,'Enabled observer changed complete result '+f.meta.id)
  assert.deepEqual(traceWork,baselineWork,'Enabled observer changed Work '+f.meta.id)
  const replay=observed.__qrReplayLatePhase()
  assert.equal(observed.__qrReplayLatePhase(),undefined,'Replay must be consumed once')
  assert.equal(globalThis.__qrLateMeshTrace,undefined,'Replay leaked mesh callback')
  checkPixels()
  if(before)assert.equal(replay,undefined,'Successful decode retained replay')
  let comparison
  if(replay){
    comparison={candidate:replay.candidate}
    for(const mode of ['ordinary','late']){
      const attempt=replay[mode],outcome=status(attempt.result,f)
      assert.notEqual(outcome,'wrong','Wrong replay payload '+f.meta.id+' '+mode)
      assert.equal(attempt.work.second,1)
      if(attempt.result){
        assert.equal(attempt.result.version,f.meta.version)
        assert.equal(attempt.result.inverted,f.meta.inverted)
        assert.equal(attempt.result.mirrored,f.meta.mirrored??false)
      }
      comparison[mode]={...attempt,status:outcome,result:summarise(attempt.result)}
    }
  }
  rows.push({...f.meta,group:g.name,role:before?'success-control':'zxing-only',baselineWork,
    baseline:summarise(before),events,replay:comparison})
  console.log(JSON.stringify({id:f.meta.id,role:before?'control':'miss',attempts:events.filter(e=>e.kind==='second-attempt').length,
    selected:!!comparison,ordinary:comparison?.ordinary.status,late:comparison?.late.status}))
}
const ids=predicate=>rows.filter(predicate).map(r=>r.id)
const summary={cases:rows.length,controls:rows.filter(r=>r.role==='success-control').length,
  misses:rows.filter(r=>r.role==='zxing-only').length,replayed:rows.filter(r=>r.replay).length,
  ordinaryCorrect:ids(r=>r.replay?.ordinary.status==='correct'),lateCorrect:ids(r=>r.replay?.late.status==='correct'),
  lateOnly:ids(r=>r.replay?.ordinary.status==='miss'&&r.replay?.late.status==='correct'),
  ordinaryOnly:ids(r=>r.replay?.ordinary.status==='correct'&&r.replay?.late.status==='miss')}
assert.equal(summary.misses,18)
writeFileSync(out,JSON.stringify({passed:true,baseline:baselineRevision,runnerSha256:sha(readFileSync(new URL(import.meta.url))),
  releasedReceiptSha256:sha(readFileSync(receiptPath)),baselineDecodeJsSha256:sha(readFileSync(root+'/dist/decode.js')),
  inputs:groups.map(g=>({suite:g.name,generator:g.file,generatorSha256:sha(readFileSync(new URL(g.file,import.meta.url))),manifestSha256:sha(readFileSync(g.manifest))})),
  identity,summary,rows},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(summary))
