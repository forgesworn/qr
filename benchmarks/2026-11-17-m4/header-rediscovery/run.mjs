import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,readdirSync} from 'node:fs'
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

if(process.argv.length!==7)throw Error('Usage: node run.mjs ROOT EXACT_BASELINE_COMMIT BUILD RIVALS NEW_RESULT_JSON')
const [rootArg,baselineRevision,buildArg,rivalsArg,outArg]=process.argv.slice(2)
const [root,build,rivals,out]=[rootArg,buildArg,rivalsArg,outArg].map(p=>resolve(p))
assert.equal(baselineRevision,'f129243285ce6d2c57819e1aa91b70807bb74741')
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),baselineRevision)
const sha=x=>createHash('sha256').update(x).digest('hex')
const json=p=>JSON.parse(readFileSync(p))
const load=p=>import(pathToFileURL(p).href)
const evidence=root+'/benchmarks/2026-11-17-m4/alternate-grid-recovery'
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
  {name:'alternateGridFresh128',generate:alternateFresh,file:'frames-next-fresh.mjs',manifest:evidence+'/fresh-manifest.json'},
]
for(const g of groups){
  g.frames=g.generate(rivals)
  assert.deepEqual(g.frames.map(f=>f.meta),json(g.manifest).cases,'Frozen inputs changed '+g.name)
  g.receipt=receipt.suites.find(s=>s.name===g.name)
  assert.ok(g.receipt,'Missing suite '+g.name)
  g.misses=new Set(g.receipt.rows.filter(r=>r.readers.candidate.status==='miss'&&r.readers.zxing.status==='correct').map(r=>r.id))
  const correct=g.receipt.rows.filter(r=>r.readers.candidate.status==='correct')
  const curated={known96:[16,32,74,87],known128:[32,42,72,73,76,79,88,90,120,122],previous128:[40]}
  const selected=correct.slice(0,2)
  for(const predicate of [r=>r.inverted,r=>r.mirrored,r=>r.readers.candidate.work.reduced>0]){
    const match=correct.find(predicate);if(match)selected.push(match)
  }
  for(const index of curated[g.name]??[]){
    const match=correct.find(r=>r.id.endsWith('-'+index))
    assert.ok(match,'Missing declared success control '+g.name+'/'+index);selected.push(match)
  }
  g.controls=new Set(selected.map(r=>r.id))
}
assert.equal(groups.reduce((n,g)=>n+g.misses.size,0),20,'Expected all 20 remaining ZX-only misses')
const baseline=await load(root+'/dist/decode.js'),observed=await load(build+'/public/decode.js'),rows=[]
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
const status=(result,f)=>!result?'miss':result.text===f.text&&Buffer.from(result.bytes).equals(Buffer.from(f.text,'utf8'))?'correct':'wrong'
const summarise=result=>result&&({...result,text:undefined,bytes:undefined,textSha256:sha(result.text),bytesSha256:sha(result.bytes)})
assert.equal(globalThis.__qrHeaderRediscoveryTrace,undefined)
assert.equal(globalThis.__qrHeaderRediscoveryCapture,undefined)
for(const g of groups)for(const f of g.frames){
  if(!g.misses.has(f.meta.id)&&!g.controls.has(f.meta.id))continue
  const old=g.receipt.rows.find(r=>r.id===f.meta.id),baselineWork=work(),offWork=work(),traceWork=work(),events=[]
  const checkPixels=()=>assert.equal(sha(f.image.data),f.meta.pixelSha256,'Changed pixels '+f.meta.id)
  checkPixels()
  const before=baseline.decodeCounted(f.image,{},baselineWork)
  checkPixels()
  assert.equal(status(before,f),old.readers.candidate.status,'Baseline outcome drift '+f.meta.id)
  assert.deepEqual(baselineWork,old.readers.candidate.work,'Baseline Work drift '+f.meta.id)
  const off=observed.decodeCounted(f.image,{},offWork)
  checkPixels()
  assert.deepEqual(off,before,'Disabled observer changed result '+f.meta.id)
  assert.deepEqual(offWork,baselineWork,'Disabled observer changed Work '+f.meta.id)
  assert.equal(observed.__qrReplayHeaderRediscovery(),undefined,'Disabled observer retained replay')
  let after
  globalThis.__qrHeaderRediscoveryTrace=event=>events.push(event)
  try{after=observed.decodeCounted(f.image,{},traceWork)}
  finally{delete globalThis.__qrHeaderRediscoveryTrace}
  checkPixels()
  assert.deepEqual(after,before,'Enabled observer changed complete result '+f.meta.id)
  assert.deepEqual(traceWork,baselineWork,'Enabled observer changed Work '+f.meta.id)
  const replay=observed.__qrReplayHeaderRediscovery()
  assert.equal(observed.__qrReplayHeaderRediscovery(),undefined,'Replay must be consumed once')
  assert.equal(globalThis.__qrHeaderRediscoveryCapture,undefined,'Replay leaked final-grid observer')
  checkPixels()
  if(before)assert.equal(replay,undefined,'Successful decode retained replay')
  let replaySummary
  if(replay){
    const outcome=status(replay.result,f)
    // Selection is already complete. Expected payload/orientation only evaluate it.
    assert.notEqual(outcome,'wrong','Wrong replay payload '+f.meta.id)
    assert.deepEqual(replay.work,work(),'Grid replay added decoder work')
    assert.equal(replay.newImageSamples,0)
    assert.equal(replay.gridReads,1)
    assert.deepEqual(replay.original.matrix,replay.candidate.matrix)
    for(const key of ['size','inverted','basis'])assert.equal(replay.original[key],replay.candidate[key])
    assert.ok(['mirrored','ecc','mask'].some(key=>replay.original[key]!==replay.candidate[key]),'Same hypothesis replayed')
    const selected=events.filter(e=>e.kind==='selected')
    assert.equal(selected.length,1)
    assert.equal(selected[0].index,replay.index)
    assert.deepEqual(selected[0].candidate,replay.candidate)
    assert.equal(replay.strictFormat,true)
    const [first,second]=replay.headers.formats
    assert(first.distance<=2&&second.distance<=2)
    assert.equal(first.ecc,second.ecc);assert.equal(first.mask,second.mask)
    if(replay.result){
      assert.equal(replay.result.version,f.meta.version)
      assert.equal(replay.result.inverted,f.meta.inverted)
      assert.equal(replay.result.mirrored,f.meta.mirrored??false)
    }
    replaySummary={...replay,status:outcome,result:summarise(replay.result)}
  }
  rows.push({...f.meta,group:g.name,role:before?'success-control':'zxing-only',baselineWork,
    baseline:summarise(before),events,replay:replaySummary})
  console.log(JSON.stringify({id:f.meta.id,role:before?'control':'miss',selected:!!replaySummary,status:replaySummary?.status,work:replaySummary?.work}))
}
const summary={cases:rows.length,controls:rows.filter(r=>r.role==='success-control').length,
  misses:rows.filter(r=>r.role==='zxing-only').length,replayed:rows.filter(r=>r.replay).length,
  recovered:rows.filter(r=>r.replay?.status==='correct').map(r=>r.id)}
assert.equal(summary.misses,20)
writeFileSync(out,JSON.stringify({passed:true,baseline:baselineRevision,runnerSha256:sha(readFileSync(new URL(import.meta.url))),
  releasedReceiptSha256:sha(readFileSync(receiptPath)),baselineJavascript:releasedJs,baselineDecodeJsSha256:sha(readFileSync(root+'/dist/decode.js')),
  inputs:groups.map(g=>({suite:g.name,generator:g.file,generatorSha256:sha(readFileSync(new URL(g.file,import.meta.url))),manifestSha256:sha(readFileSync(g.manifest))})),
  identity,summary,rows},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(summary))
