import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {framesFor as frames96} from './frames96.mjs'
import {framesFor as frames128} from './frames128.mjs'
import {framesFor as previous128} from './frames-previous128.mjs'
import {framesFor as holdout} from './frames-holdout.mjs'
import {framesFor as previousFresh} from './frames-previous-fresh.mjs'
import {framesFor as fresh} from './frames-fresh.mjs'
const [root,build,rivals,out,secondLimitText]=process.argv.slice(2),sha=x=>createHash('sha256').update(x).digest('hex'),load=p=>import(pathToFileURL(p)),ext=createRequire(rivals+'/package.json')
const identity=JSON.parse(readFileSync(build+'/identity.json'))
assert.equal(identity.revision,'d6a411ca26f01f9a2b32e7a3e7bcccbbdefc7a63')
for(const [variant,files] of Object.entries(identity.generated))for(const [name,hash]of Object.entries(files))
 assert.equal(sha(readFileSync(build+'/'+variant+'/'+name.replace(/\.ts$/,'.js'))),hash,'Built source drift')
const candidateSecondLimit=Number(secondLimitText)
assert(Number.isInteger(candidateSecondLimit)&&candidateSecondLimit===8,'Explicit candidate bound required')
const readers={base:await load(build+'/base/decode.js'),candidate:await load(build+'/public/decode.js')}
assert.equal(JSON.parse(readFileSync(rivals+'/node_modules/zxing-wasm/package.json')).version,'3.1.7')
const zx=await load(ext.resolve('zxing-wasm/reader')),binary=readFileSync(ext.resolve('zxing-wasm/reader/zxing_reader.wasm'))
assert.equal(sha(binary),'33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59')
await zx.prepareZXingModule({overrides:{wasmBinary:binary},fireImmediately:true})
const {loadWasm}=await load(root+'/dist/wasm.js'),wasmBinary=readFileSync(root+'/dist/qr.wasm'),wasm=await loadWasm(wasmBinary)
const normalise=r=>r&&({...r,location:Object.fromEntries(Object.entries(r.location).map(([key,p])=>[key,p&&{x:p.x,y:p.y}]))})
const groups=[['known96',frames96(rivals),root+'/benchmarks/2026-11-16-m4/mesh-boundary-continuation/fresh-manifest.json'],['known128',frames128(rivals),root+'/benchmarks/2026-11-16-m4/deferred-mesh-reading/new128-manifest.json'],['previous128',previous128(rivals),root+'/benchmarks/2026-11-17-m4/starved-curvature-recovery/holdout-manifest.json'],['holdout128',holdout(rivals),root+'/benchmarks/2026-11-17-m4/conflicting-format-recovery/holdout-manifest.json'],['fresh128',previousFresh(rivals),root+'/benchmarks/2026-11-17-m4/ordinary-curvature-refinement/fresh-manifest.json'],['versionPeerFresh128',fresh(rivals),new URL('./fresh-manifest.json',import.meta.url)]]
const previous=JSON.parse(readFileSync(root+'/benchmarks/2026-11-17-m4/ordinary-curvature-refinement/production-qualified.json'))
assert(previous.passed)
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0}),suites=[]
for(const[name,frames,manifest]of groups){
 assert.deepEqual(frames.map(f=>f.meta),JSON.parse(readFileSync(manifest)).cases,'Frozen inputs changed '+name)
 const rows=[],totals=Object.fromEntries(['base','candidate','zxing'].map(k=>[k,{correct:0,miss:0,wrong:0}])),gains=[]
 for(const f of frames){
  const row={...f.meta,readers:{}};let before
  for(const[key,api]of Object.entries(readers)){
   const count=work(),result=api.decodeCounted(f.image,{},count),status=!result?'miss':result.text===f.text&&Buffer.from(result.bytes).equals(Buffer.from(f.text))?'correct':'wrong'
   assert.notEqual(status,'wrong',f.meta.id+' '+key);assert.equal(sha(f.image.data),f.meta.pixelSha256)
   assert(count.maps<=720&&count.second<=(key==='base'?7:candidateSecondLimit)&&count.probed<=(key==='base'?7:candidateSecondLimit)*1437500)
   if(key==='candidate'){assert.deepEqual(normalise(wasm.decode(f.image)),normalise(result),'Complete WASM result '+f.meta.id);assert.equal(sha(f.image.data),f.meta.pixelSha256)}
   row.readers[key]={status,work:count};totals[key][status]++
   if(key==='base'&&name!=='versionPeerFresh128'){const old=previous.suites.find(s=>s.name===name).rows.find(r=>r.id===f.meta.id).readers.candidate;assert.equal(status,old.status);assert.deepEqual(count,old.work)}
   if(key==='base')before=result;else if(before)assert.deepEqual(result,before,'Changed complete baseline success '+f.meta.id);else if(result)gains.push(f.meta.id)
  }
  const rgba=new Uint8ClampedArray(f.image.data.length*4);for(let i=0;i<f.image.data.length;i++){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=f.image.data[i];rgba[i*4+3]=255}
  const result=(await zx.readBarcodes({data:rgba,width:f.image.width,height:f.image.height},{formats:['QRCode'],maxNumberOfSymbols:1,tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,textMode:'Plain'}))[0]
  const status=!result?'miss':result.text===f.text&&Buffer.from(result.bytes).equals(Buffer.from(f.text))?'correct':'wrong'
  totals.zxing[status]++;row.readers.zxing={status};rows.push(row)
 }
 suites.push({name,manifestSha256:sha(readFileSync(manifest)),totals,gains,rows});console.log(JSON.stringify({name,totals,gains}))
}
wasm.dispose()
writeFileSync(out,JSON.stringify({passed:true,fullWasmParity:true,candidateSecondLimit,wasmSha256:sha(wasmBinary),identity:JSON.parse(readFileSync(build+'/identity.json')),runnerSha256:sha(readFileSync(new URL(import.meta.url))),zxingWasmSha256:sha(binary),suites},null,2)+'\n',{flag:'wx'})
