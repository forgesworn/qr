import {publicResult} from './public-result.mjs'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {verifyProduction} from './production-identity.mjs'
import {corpora} from './corpora.mjs'
import {framesFor as validation} from './validation-frames.mjs'
const [root,base]=process.argv.slice(2),hash=b=>createHash('sha256').update(b).digest('hex'),json=p=>JSON.parse(readFileSync(p)),load=p=>import(pathToFileURL(p).href)
assert(!existsSync(base+'/production-backends.json'))
const binding=await verifyProduction(root,base),qualification=json(base+'/qualification.json'),regression=json(base+'/regression.json');assert(regression.passed)
const ts=await load(root+'/dist/decode.js'),{loadWasm}=await load(root+'/dist/wasm.js'),wasm=await loadWasm(readFileSync(root+'/dist/qr.wasm')),rows=[]
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
function check(suite,name,image,expected,expectedBytes,prior,pixelHash){
 assert.equal(hash(image.data),pixelHash);const w=work(),a=ts.decodeCounted(image,{},w),b=wasm.decode(image)
 assert.deepEqual(publicResult(b),publicResult(a),suite+'/'+name+' complete TS/WASM result');assert.equal(hash(image.data),pixelHash);assert.deepEqual(w,prior.work)
 const status=expected===null?(a?'negativeFalse':'negativeClean'):!a?'miss':a.text===expected&&(expectedBytes===undefined||Buffer.from(a.bytes).toString('hex')===expectedBytes)?'correct':'wrong'
 assert.equal(status,prior.status,suite+'/'+name+' qualification status');assert(!['wrong','negativeFalse'].includes(status))
 rows.push({suite,name,pixelSha256:pixelHash,status,work:w,result:a?{...a,text:undefined,bytes:undefined,textSha256:hash(a.text),bytesSha256:hash(a.bytes)}:null})
}
try{
 for(const [name,generator,manifest]of [...corpora,['new256',null,null]]){
  const frames=generator?(await load(root+'/benchmarks/2026-11-17-m4/selected-mesh-recovery/'+generator)).framesFor(base+'/rivals'):validation(base+'/rivals'),prior=qualification.suites.find(s=>s.name===name)
  assert.deepEqual(frames.map(f=>f.meta),manifest?json(root+'/'+manifest).cases:json(base+'/validation-manifest.json').cases)
  for(const f of frames){const old=prior.rows.find(r=>r.id===f.meta.id);assert(old);check(name,f.meta.id,f.image,f.text,Buffer.from(f.text).toString('hex'),old.readers.candidate,f.meta.pixelSha256)}
  console.log(name,'matched',frames.length)
 }
 process.env.QR_RIVALS=base+'/rivals'
 const ext=createRequire(base+'/rivals/package.json'),qr=ext('qrcode'),encode=(text,ecc)=>{const q=qr.create(text,{errorCorrectionLevel:ecc});return{size:q.modules.size,modules:q.modules.data}}
 const {readPng}=await load(base+'/png.mjs'),{validationFrames,heldOutFrames}=await load(root+'/scripts/comparison-fixtures.mjs')
 const {makeCase:stress}=await load(root+'/benchmarks/2026-11-16-m4/fresh-stress-unevaluated/generate.mjs'),{makeCase:qualified}=await load(root+'/benchmarks/2026-11-16-m4/overflow-recovery/fresh160/generate.mjs')
 const photos=json(root+'/vectors/photos.json').photos
 for(const suite of regression.suites){
  const synthetic=suite.name==='validation192'?validationFrames(encode):suite.name==='synthetic96'?heldOutFrames(encode):null
  for(let i=0;i<suite.rows.length;i++){
   const prior=suite.rows[i];let image,text,bytes
   if(suite.name==='photos184'){const p=photos.find(p=>p.id===prior.name);assert(p);const raw=readFileSync(root+'/vectors/photos-cache/raw/'+p.id+'.txt');assert.equal(hash(raw),p.textSha256);image=readPng(readFileSync(root+'/vectors/photos-cache/grey/'+p.id+'.png'));text=new TextDecoder('utf8',{fatal:true}).decode(raw)}
   else if(suite.name==='stress256'){const f=i<224?stress(Math.floor(i/28),i%28):stress(8,i-224);image=f.image;text=f.meta.expectedText;bytes=f.meta.expectedUtf8Hex}
   else if(suite.name==='previously-qualified160'){const f=qualified(i);image=f.image;text=f.meta.expectedText;bytes=f.meta.expectedUtf8Hex}
   else{image=synthetic[i];text=image.expected;bytes=Buffer.from(text).toString('hex')}
   assert.equal(text===null?null:hash(text),prior.expectedTextSha256);check(suite.name,prior.name,image,text,bytes,prior.readers.candidate,prior.pixelSha256)
  }
  console.log(suite.name,'matched',suite.rows.length)
 }
 assert.equal(rows.length,2264)
 writeFileSync(base+'/production-backends.json',JSON.stringify({passed:true,binding,count:rows.length,runnerSha256:hash(readFileSync(new URL(import.meta.url))),qualificationSha256:hash(readFileSync(base+'/qualification.json')),regressionSha256:hash(readFileSync(base+'/regression.json')),rows},null,2)+'\n',{flag:'wx'})
}finally{wasm.dispose()}
