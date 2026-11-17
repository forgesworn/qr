import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {corpora} from './corpora.mjs'
import {verifyPrototype} from './verify-prototype.mjs'
import {framesFor as validation} from './validation-frames.mjs'
const [root,base]=process.argv.slice(2),sha=x=>createHash('sha256').update(x).digest('hex'),json=p=>JSON.parse(readFileSync(p)),load=p=>import(pathToFileURL(p).href)
assert(!existsSync(base+'/qualification.json'))
const identity=verifyPrototype(root,base),frozen=json(base+'/validation-manifest.json'),old=json(root+'/benchmarks/2026-11-17-m4/selected-mesh-recovery/production-qualified.json')
assert.deepEqual(identity,frozen.identity);assert(frozen.frozenBeforeValidationEvaluation);assert.equal(frozen.disjointEarlierCases,1120)
assert.equal(sha(readFileSync(base+'/validation-frames.mjs')),frozen.generatorSha256);assert.equal(sha(readFileSync(base+'/validation-declaration.json')),frozen.declarationSha256)
for(const m of frozen.priorManifests)assert.equal(sha(readFileSync(root+'/'+m.path)),m.sha256)
const readers={base:await load(root+'/dist/decode.js'),candidate:await load(base+'/prototype-build/public/decode.js')},ext=createRequire(base+'/rivals/package.json')
assert.equal(json(base+'/rivals/node_modules/zxing-wasm/package.json').version,'3.1.7');const binary=readFileSync(ext.resolve('zxing-wasm/reader/zxing_reader.wasm'));assert.equal(sha(binary),'33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59')
const zx=await load(ext.resolve('zxing-wasm/reader'));await zx.prepareZXingModule({overrides:{wasmBinary:binary},fireImmediately:true})
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0}),suites=[]
for(const [name,generator,manifest]of [...corpora,['new256',null,null]]){
 const frames=generator?(await load(root+'/benchmarks/2026-11-17-m4/selected-mesh-recovery/'+generator)).framesFor(base+'/rivals'):validation(base+'/rivals')
 assert.deepEqual(frames.map(f=>f.meta),manifest?json(root+'/'+manifest).cases:frozen.cases)
 const rows=[],totals=Object.fromEntries(['base','candidate','zxing'].map(k=>[k,{correct:0,miss:0,wrong:0}])),gains=[]
 for(const f of frames){const row={...f.meta,readers:{}};let before
  for(const [key,api]of Object.entries(readers)){
   assert.equal(sha(f.image.data),f.meta.pixelSha256);const w=work(),result=api.decodeCounted(f.image,{},w),status=!result?'miss':result.text===f.text&&Buffer.from(result.bytes).equals(Buffer.from(f.text))?'correct':'wrong'
   assert.notEqual(status,'wrong',f.meta.id+' '+key);assert.equal(sha(f.image.data),f.meta.pixelSha256);assert(w.maps<=720&&w.second<=8&&w.probed<=11500000)
   totals[key][status]++;row.readers[key]={status,work:w}
   if(key==='base'){before=result;if(manifest){const prior=old.suites.find(s=>s.name===name).rows.find(r=>r.id===f.meta.id).readers.candidate;assert.equal(status,prior.status);assert.deepEqual(w,prior.work)}}else if(before)assert.deepEqual(result,before,'Changed earlier complete success '+f.meta.id);else if(result)gains.push(f.meta.id)
  }
  assert.deepEqual(row.readers.base.work,row.readers.candidate.work,'Changed legacy search counters '+f.meta.id)
  const data=new Uint8ClampedArray(f.image.data.length*4);for(let i=0;i<f.image.data.length;i++){data[i*4]=data[i*4+1]=data[i*4+2]=f.image.data[i];data[i*4+3]=255}const rh=sha(data)
  const result=(await zx.readBarcodes({data,width:f.image.width,height:f.image.height},{formats:['QRCode'],maxNumberOfSymbols:1,tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,textMode:'Plain'}))[0]
  assert.equal(sha(data),rh);const status=!result?'miss':result.text===f.text&&Buffer.from(result.bytes).equals(Buffer.from(f.text))?'correct':'wrong';totals.zxing[status]++;row.readers.zxing={status};rows.push(row)
 }
 suites.push({name,manifestSha256:sha(readFileSync(manifest?root+'/'+manifest:base+'/validation-manifest.json')),totals,gains,rows});console.log(JSON.stringify({name,totals,gains}))
}
assert.equal(suites.reduce((n,s)=>n+s.rows.length,0),1376)
writeFileSync(base+'/qualification.json',JSON.stringify({passed:true,identity,validationSha256:sha(readFileSync(base+'/validation-manifest.json')),runnerSha256:sha(readFileSync(new URL(import.meta.url))),legacyCounters:'Unchanged; excludes one terminal quadratic sampling/threshold/symbol pass',zxingWasmSha256:sha(binary),suites},null,2)+'\n',{flag:'wx'})
