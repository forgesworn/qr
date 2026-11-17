import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {verifyProductionIdentity} from './verify-production-identity.mjs'
const [root,build,rivals,qualified,output]=process.argv.slice(2),load=p=>import(pathToFileURL(p)),hash=b=>createHash('sha256').update(b).digest('hex')
const binding=await verifyProductionIdentity(root,build)
const reference=JSON.parse(readFileSync(qualified));assert(reference.passed)
assert.deepEqual(reference.identity.sources,binding.identity.sources,'Qualified source identity differs')
assert.deepEqual(reference.identity.generated,binding.identity.generated,'Qualified JavaScript identity differs')
process.env.QR_RIVALS=rivals
const ext=createRequire(rivals+'/package.json');assert.equal(ext('qrcode/package.json').version,'1.5.4')
const qr=ext('qrcode'),encode=(text,ecc)=>{const q=qr.create(text,{errorCorrectionLevel:ecc});return{size:q.modules.size,modules:q.modules.data}}
const {makeCase:stress}=await load(root+'/benchmarks/2026-11-16-m4/fresh-stress-unevaluated/generate.mjs'),{makeCase:previous}=await load(root+'/benchmarks/2026-11-16-m4/overflow-recovery/fresh160/generate.mjs')
const {validationFrames,heldOutFrames,rgba}=await load(root+'/scripts/comparison-fixtures.mjs'),{readPng}=await load(build+'/png.js')
const baseline=await load(build+'/base/decode.js'),ts=await load(root+'/dist/decode.js'),{loadWasm}=await load(root+'/dist/wasm.js'),binary=readFileSync(root+'/dist/qr.wasm'),wasm=await loadWasm(binary)
const rows=[],normalise=r=>r&&({...r,location:Object.fromEntries(Object.entries(r.location).map(([k,p])=>[k,p&&{x:p.x,y:p.y}]))})
try {
 for(const suite of reference.suites){
  const synthetic=suite.name==='validation192'?validationFrames(encode):suite.name==='synthetic96'?heldOutFrames(encode):null
  for(const [i,prior]of suite.rows.entries()){
   let image
   if(suite.name==='photos184')image=readPng(readFileSync(root+'/vectors/photos-cache/grey/'+prior.name+'.png'))
   else if(suite.name==='stress256')image=(i<224?stress(Math.floor(i/28),i%28):stress(8,i-224)).image
   else if(suite.name==='previously-qualified160')image=previous(i).image
   else image=synthetic[i]
   assert.equal(hash(image.data),prior.pixelSha256)
   const frame=image.data.length===image.width*image.height*4?image:rgba(image)
   assert.equal(hash(frame.data),prior.rgbaSha256)
   const zero=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
   const candidateWork=zero(),baselineWork=zero()
   const a=ts.decodeCounted(frame,{},candidateWork);assert.equal(hash(frame.data),prior.rgbaSha256,prior.name+' TypeScript input')
   const b=wasm.decode(frame);assert.equal(hash(frame.data),prior.rgbaSha256,prior.name+' WASM input')
   const old=baseline.decodeCounted(frame,{},baselineWork);assert.equal(hash(frame.data),prior.rgbaSha256,prior.name+' baseline input')
   assert.deepEqual(candidateWork,baselineWork,prior.name+' Work differs')
   if(old)assert.deepEqual(normalise(a),normalise(old),prior.name+' complete previous result')
   assert.deepEqual(normalise(a),normalise(b),prior.name+' full backend result')
   assert.equal(hash(frame.data),prior.rgbaSha256)
   assert.equal(a?hash(Buffer.from(a.text)):null,prior.readers.candidate.textSha256)
   assert.equal(a?hash(a.bytes):null,prior.readers.candidate.bytesSha256)
   rows.push({suite:suite.name,name:prior.name,read:!!a,textSha256:a?hash(Buffer.from(a.text)):null,bytesSha256:a?hash(a.bytes):null})
  }
 }
 assert.equal(rows.length,888)
 const digest=createHash('sha256');for(const file of readdirSync(root+'/dist').filter(f=>f.endsWith('.js')).sort())digest.update(file).update(readFileSync(root+'/dist/'+file))
 writeFileSync(output,JSON.stringify({passed:true,binding,count:rows.length,javascriptSha256:digest.digest('hex'),wasmSha256:hash(binary),wasmBytes:binary.length,qualificationSha256:hash(readFileSync(qualified)),runnerSha256:hash(readFileSync(new URL(import.meta.url))),rows},null,2)+'\n',{flag:'wx'})
 console.log('Matched all 888 qualified results, complete TS/WASM output and unchanged pixels')
}finally{wasm.dispose()}
