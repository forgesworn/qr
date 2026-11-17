import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {framesFor as frames96} from './frames96.mjs'
import {framesFor as frames128} from './frames128.mjs'
const [root,build,rivals,out]=process.argv.slice(2),sha=x=>createHash('sha256').update(x).digest('hex'),load=p=>import(pathToFileURL(p))
const evidence=root+'/benchmarks/2026-11-16-m4/deferred-mesh-reading',groups=[
 {name:'96',frames:frames96(rivals),manifest:JSON.parse(readFileSync(root+'/benchmarks/2026-11-16-m4/mesh-boundary-continuation/fresh-manifest.json')),receipt:JSON.parse(readFileSync(evidence+'/production-frozen.json'))},
 {name:'128',frames:frames128(rivals),manifest:JSON.parse(readFileSync(evidence+'/new128-manifest.json')),receipt:JSON.parse(readFileSync(evidence+'/production-new128.json'))}
]
for(const g of groups)assert.deepEqual(g.frames.map(f=>f.meta),g.manifest.cases,'Frozen pixels changed '+g.name)
const baseline=await load(root+'/dist/decode.js'),observed=await load(build+'/public/decode.js'),rows=[]
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
for(const g of groups){
 const misses=new Set(g.receipt.rows.filter(r=>r.readers.candidate.status==='miss'&&r.readers.zxing.status==='correct').map(r=>r.id))
 const controls=new Set(g.receipt.rows.filter(r=>r.readers.candidate.status==='correct').slice(0,g.name==='96'?3:3).map(r=>r.id))
 if(g.name==='96')for(const i of [16,87])controls.add('boundary-unseen-'+i)
 for(const f of g.frames){
  if(!misses.has(f.meta.id)&&!controls.has(f.meta.id))continue
  const baselineWork=work(),traceWork=work(),events=[]
  const before=baseline.decodeCounted(f.image,{},baselineWork)
  globalThis.__qrStarvationTrace=event=>events.push(event)
  const after=observed.decodeCounted(f.image,{},traceWork)
  delete globalThis.__qrStarvationTrace
  assert.deepEqual(after,before,'Changed full result '+f.meta.id)
  assert.deepEqual(traceWork,baselineWork,'Changed work '+f.meta.id)
  assert.equal(sha(f.image.data),f.meta.pixelSha256)
  assert.equal(!!before,controls.has(f.meta.id),'Baseline no longer matches qualified outcome '+f.meta.id)
  const replay=observed.__qrReplayStarved()
  assert.equal(observed.__qrReplayStarved(),undefined,'Replay must be consumed once')
  assert.equal(sha(f.image.data),f.meta.pixelSha256)
  if(before)assert.equal(replay,undefined,'Successful baseline must not retain replay')
  let replaySummary
  if(replay){
   const {result,...rest}=replay
   const status=!result?'miss':result.text===f.text&&Buffer.from(result.bytes).equals(Buffer.from(f.text))?'correct':'wrong'
   assert.notEqual(status,'wrong',f.meta.id+' wrong diagnostic payload')
   if(result){assert.equal(result.version,f.meta.version);assert.equal(result.inverted,f.meta.inverted);assert.equal(result.mirrored,f.meta.mirrored??false)}
   replaySummary={...rest,status,result:result&&{...result,text:undefined,bytes:undefined,textSha256:sha(result.text),bytesSha256:sha(result.bytes)}}
  }
  rows.push({...f.meta,group:g.name,role:before?'success-control':'zxing-only',baselineWork,events,replay:replaySummary})
  console.log(JSON.stringify({id:f.meta.id,role:before?'control':'miss',events:events.length,replay:replaySummary?.status,work:replaySummary?.work}))
 }
}
const summary={cases:rows.length,controls:rows.filter(r=>r.role==='success-control').length,misses:rows.filter(r=>r.role==='zxing-only').length,replayed:rows.filter(r=>r.replay).length,recovered:rows.filter(r=>r.replay?.status==='correct').map(r=>r.id)}
writeFileSync(out,JSON.stringify({passed:true,baseline:'f090e489422507f57e30f50b6c8d5f6efdc4993a',runnerSha256:sha(readFileSync(new URL(import.meta.url))),identity:JSON.parse(readFileSync(build+'/identity.json')),summary,rows},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(summary))
