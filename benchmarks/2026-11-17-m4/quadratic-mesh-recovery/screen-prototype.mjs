import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {framesFor as previous} from './frames-previous128.mjs'
import {framesFor as fresh} from './frames-previous-fresh.mjs'
import {framesFor as version} from './frames-fresh.mjs'
import {framesFor as alternate} from './frames-next-fresh.mjs'
import {framesFor as header} from './frames-validation.mjs'
import {framesFor as selected} from './frames-selected-validation.mjs'
const [root,base]=process.argv.slice(2),sha=x=>createHash('sha256').update(x).digest('hex'),json=p=>JSON.parse(readFileSync(p)),load=p=>import(pathToFileURL(p).href)
assert(!existsSync(base+'/prototype-screen.json'))
const stageRaw=readFileSync(base+'/stages.json'),stages=JSON.parse(stageRaw),identity=json(base+'/prototype-build/identity.json'),qualified=json(root+'/benchmarks/2026-11-17-m4/selected-mesh-recovery/production-qualified.json')
assert(stages.passed&&identity.typechecked)
for(const [n,h]of Object.entries(identity.generated))assert.equal(sha(readFileSync(base+'/prototype-build/public/'+n.replace(/\.ts$/,'.js'))),h)
for(const [n,h]of Object.entries(qualified.identity.generated.public))assert.equal(sha(readFileSync(root+'/dist/'+n.replace(/\.ts$/,'.js'))),h)
const before=await load(root+'/dist/decode.js'),after=await load(base+'/prototype-build/public/decode.js'),encode=await load(root+'/dist/index.js'),{timingFrames}=await load(root+'/scripts/comparison-fixtures.mjs')
const frames=new Map([previous,fresh,version,alternate,header,selected].flatMap(g=>g(base+'/rivals')).map(f=>[f.meta.id,f]))
const clean=timingFrames(encode.encode).find(f=>f.expected!==undefined);let state=0x671239
const noise=Uint8Array.from({length:320*240},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state>>>24})
for(const [id,image]of [['clean',clean],['blank',{width:320,height:240,data:new Uint8Array(320*240).fill(255)}],['noise',{width:320,height:240,data:noise}]])frames.set(id,{meta:{id,pixelSha256:sha(image.data)},image,text:image.expected})
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0}),summary=r=>r?{...r,text:undefined,bytes:undefined,textSha256:sha(r.text),bytesSha256:sha(r.bytes)}:null
const rows=[]
for(const old of stages.rows){const f=frames.get(old.id);assert(f);assert.equal(sha(f.image.data),old.pixelSha256)
 const a=work(),b=work(),x=before.decodeCounted(f.image,{},a),y=after.decodeCounted(f.image,{},b)
 assert.deepEqual(a,old.work);assert.deepEqual(a,b);assert.equal(sha(f.image.data),old.pixelSha256)
 if(x)assert.deepEqual(y,x,'Earlier success changed '+old.id)
 const wanted=f.text!==undefined;assert.equal(!!y,wanted,'Expected status '+old.id)
 if(y){assert.equal(y.text,f.text);assert.deepEqual(Buffer.from(y.bytes),Buffer.from(f.text))}
 rows.push({id:old.id,before:summary(x),after:summary(y),work:b,gained:!x&&!!y})
}
assert.equal(rows.filter(r=>r.gained).length,5)
for(const id of ['blank','clean','noise']){const f=frames.get(id),a=work(),b=work();assert.deepEqual(after.decodeCounted(f.image,{},a),before.decodeCounted(f.image,{},b));assert.deepEqual(a,b)}
writeFileSync(base+'/prototype-screen.json',JSON.stringify({passed:true,scope:'Known16 causal screen only; fresh qualification pending',identity,stagesSha256:sha(stageRaw),runnerSha256:sha(readFileSync(new URL(import.meta.url))),rows,reset:true},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({passed:true,cases:rows.length,gains:rows.filter(r=>r.gained).map(r=>r.id),lostSuccesses:0,wrong:0,workUnchanged:true,reset:true}))
