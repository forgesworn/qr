import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {verifyProductionIdentity} from './verify-production-identity.mjs'
import {framesFor as frames96} from './frames96.mjs'
import {framesFor as frames128} from './frames128.mjs'
import {framesFor as previous128} from './frames-previous128.mjs'
import {framesFor as holdout} from './frames-holdout.mjs'
import {framesFor as previousFresh} from './frames-previous-fresh.mjs'
import {framesFor as fresh} from './frames-fresh.mjs'
import {framesFor as nextFresh} from './frames-next-fresh.mjs'
const [root,build,rivals,out,secondLimitText]=process.argv.slice(2),sha=x=>createHash('sha256').update(x).digest('hex'),load=p=>import(pathToFileURL(p)),ext=createRequire(rivals+'/package.json')
// The builder pins candidate-source/identity.json adjacent to this runner.
const binding=await verifyProductionIdentity(root,build)
const identity=JSON.parse(readFileSync(build+'/identity.json'))
const prototype=JSON.parse(readFileSync(new URL('./candidate-source/identity.json',import.meta.url)))
assert.equal(identity.revision,'8360eb3b648ebc1d9439684a9f643cc1fb162713')
assert.equal(identity.typecheck?.passed,true,'Candidate typecheck required')
assert.deepEqual(identity.prototype,prototype,'Prototype identity mismatch')
assert.equal(prototype.revision,identity.revision)
assert.equal(prototype.prototypeSha256,sha(readFileSync(new URL('./prototype.py',import.meta.url))))
assert.equal(prototype.expectedSourcesSha256,sha(readFileSync(new URL('./expected-sources.json',import.meta.url))))
assert.deepEqual(identity.sources.base,prototype.sourceFiles,'Base source identity mismatch')
assert.deepEqual(identity.sources.public,prototype.copiedFiles,'Candidate source identity mismatch')
for(const [name,hash] of Object.entries(identity.sources.public))assert.equal(sha(readFileSync(root+'/src/'+name)),hash,'Production source drift '+name)
for(const [name,hash] of Object.entries(identity.sources.public))assert.equal(sha(readFileSync(new URL('./candidate-source/'+name,import.meta.url))),hash,'Candidate source drift '+name)
for(const variant of ['base','public']){
 assert.deepEqual(Object.keys(identity.generated[variant]).sort(),Object.keys(identity.sources[variant]).filter(n=>n.endsWith('.ts')).sort(),'Generated module set mismatch '+variant)
 for(const [name,hash]of Object.entries(identity.generated[variant]))
  assert.equal(sha(readFileSync(build+'/'+variant+'/'+name.replace(/\.ts$/,'.js'))),hash,'Built source drift '+variant+'/'+name)
}
const previous=JSON.parse(readFileSync(root+'/benchmarks/2026-11-17-m4/version-peer-recovery/production-qualified.json'))
assert(previous.passed,'Released qualification required')
assert.deepEqual(identity.sources.base,previous.identity.sources.public,'Baseline source differs from released qualification')
assert.deepEqual(identity.generated.base,previous.identity.generated.public,'Baseline JS differs from released qualification')
const candidateSecondLimit=Number(secondLimitText)
assert(Number.isInteger(candidateSecondLimit)&&candidateSecondLimit===8,'Explicit candidate bound required')
const readers={base:await load(build+'/base/decode.js'),candidate:await load(build+'/public/decode.js')}
assert.equal(JSON.parse(readFileSync(rivals+'/node_modules/zxing-wasm/package.json')).version,'3.1.7')
const zx=await load(ext.resolve('zxing-wasm/reader')),binary=readFileSync(ext.resolve('zxing-wasm/reader/zxing_reader.wasm'))
assert.equal(sha(binary),'33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59')
await zx.prepareZXingModule({overrides:{wasmBinary:binary},fireImmediately:true})
const {loadWasm}=await load(root+'/dist/wasm.js'),wasmBinary=readFileSync(root+'/dist/qr.wasm'),wasm=await loadWasm(wasmBinary)
const normalise=r=>r&&({...r,location:Object.fromEntries(Object.entries(r.location).map(([key,p])=>[key,p&&{x:p.x,y:p.y}]))})
const freshManifest=JSON.parse(readFileSync(new URL('./fresh-manifest.json',import.meta.url)))
assert.equal(freshManifest.baseline,identity.revision,'Fresh baseline mismatch')
assert.equal(freshManifest.generatorSha256,sha(readFileSync(new URL('./frames-next-fresh.mjs',import.meta.url))),'Fresh generator drift')
assert.equal(freshManifest.frozenBeforeDecoderEvaluation,true,'Fresh corpus was not frozen before evaluation')
assert.equal(freshManifest.disjointEarlierCases,736,'Fresh corpus disjointness claim mismatch')
const groups=[['known96',frames96(rivals),root+'/benchmarks/2026-11-16-m4/mesh-boundary-continuation/fresh-manifest.json'],['known128',frames128(rivals),root+'/benchmarks/2026-11-16-m4/deferred-mesh-reading/new128-manifest.json'],['previous128',previous128(rivals),root+'/benchmarks/2026-11-17-m4/starved-curvature-recovery/holdout-manifest.json'],['holdout128',holdout(rivals),root+'/benchmarks/2026-11-17-m4/conflicting-format-recovery/holdout-manifest.json'],['fresh128',previousFresh(rivals),root+'/benchmarks/2026-11-17-m4/ordinary-curvature-refinement/fresh-manifest.json'],['versionPeerFresh128',fresh(rivals),root+'/benchmarks/2026-11-17-m4/version-peer-recovery/fresh-manifest.json'],['alternateGridFresh128',nextFresh(rivals),new URL('./fresh-manifest.json',import.meta.url)]]
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0}),suites=[]
for(const[name,frames,manifest]of groups){
 assert.deepEqual(frames.map(f=>f.meta),JSON.parse(readFileSync(manifest)).cases,'Frozen inputs changed '+name)
 const rows=[],totals=Object.fromEntries(['base','candidate','zxing'].map(k=>[k,{correct:0,miss:0,wrong:0}])),gains=[]
 for(const f of frames){
  const row={...f.meta,readers:{}};let before
  for(const[key,api]of Object.entries(readers)){
   const count=work();assert.equal(sha(f.image.data),f.meta.pixelSha256,'Input drift before '+f.meta.id);const result=api.decodeCounted(f.image,{},count),status=!result?'miss':result.text===f.text&&Buffer.from(result.bytes).equals(Buffer.from(f.text))?'correct':'wrong'
   assert.notEqual(status,'wrong',f.meta.id+' '+key);assert.equal(sha(f.image.data),f.meta.pixelSha256)
   assert(count.maps<=720&&count.second<=(key==='base'?8:candidateSecondLimit)&&count.probed<=(key==='base'?8:candidateSecondLimit)*1437500)
   if(key==='candidate'){assert.deepEqual(normalise(wasm.decode(f.image)),normalise(result),'Complete WASM result '+f.meta.id);assert.equal(sha(f.image.data),f.meta.pixelSha256,'WASM changed input '+f.meta.id)}
   row.readers[key]={status,work:count};totals[key][status]++
   if(key==='base'&&name!=='alternateGridFresh128'){const old=previous.suites.find(s=>s.name===name).rows.find(r=>r.id===f.meta.id).readers.candidate;assert.equal(status,old.status);assert.deepEqual(count,old.work)}
   if(key==='base')before=result;else if(before)assert.deepEqual(result,before,'Changed complete baseline success '+f.meta.id);else if(result)gains.push(f.meta.id)
  }
  assert.deepEqual(row.readers.candidate.work,row.readers.base.work,'Candidate Work changed '+f.meta.id)
  const rgba=new Uint8ClampedArray(f.image.data.length*4);for(let i=0;i<f.image.data.length;i++){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=f.image.data[i];rgba[i*4+3]=255}
  const rgbaSha256=sha(rgba)
  const result=(await zx.readBarcodes({data:rgba,width:f.image.width,height:f.image.height},{formats:['QRCode'],maxNumberOfSymbols:1,tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,textMode:'Plain'}))[0]
  assert.equal(sha(rgba),rgbaSha256,'ZXing changed RGBA input '+f.meta.id)
  assert.equal(sha(f.image.data),f.meta.pixelSha256,'Input drift after ZXing '+f.meta.id)
  const status=!result?'miss':result.text===f.text&&Buffer.from(result.bytes).equals(Buffer.from(f.text))?'correct':'wrong'
  totals.zxing[status]++;row.readers.zxing={status};rows.push(row)
 }
 assert.equal(rows.length,name==='known96'?96:128,'Unexpected corpus size '+name)
 suites.push({name,manifestSha256:sha(readFileSync(manifest)),totals,gains,rows});console.log(JSON.stringify({name,totals,gains}))
}
assert.equal(suites.reduce((n,s)=>n+s.rows.length,0),864,'Unexpected total case count')
const qualified=JSON.parse(readFileSync(new URL('./qualification.json',import.meta.url)))
assert(qualified.passed,'Frozen prototype qualification required')
assert.deepEqual(suites,qualified.suites,'Production suite results differ from frozen prototype qualification')
wasm.dispose()
writeFileSync(out,JSON.stringify({passed:true,fullWasmParity:true,wasmSha256:sha(wasmBinary),candidateSecondLimit,binding,identity:JSON.parse(readFileSync(build+'/identity.json')),runnerSha256:sha(readFileSync(new URL(import.meta.url))),zxingWasmSha256:sha(binary),suites},null,2)+'\n',{flag:'wx'})
