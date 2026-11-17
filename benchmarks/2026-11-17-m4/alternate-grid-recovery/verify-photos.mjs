import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {verifyProductionIdentity} from './verify-production-identity.mjs'
assert.equal(process.argv.length, 5, 'usage: node verify-photos.mjs <root> <build> <output>')
const [root,build,output]=process.argv.slice(2),load=p=>import(pathToFileURL(build+'/'+p)),hash=b=>createHash('sha256').update(b).digest('hex')
const fd=openSync(output,'wx');closeSync(fd)
const binding=await verifyProductionIdentity(root,build)
const identity=binding.identity
const {loadWasm}=await import(pathToFileURL(root+'/dist/wasm.js'))
const binary=readFileSync(root+'/dist/qr.wasm')
assert.equal(hash(binary),binding.wasmSha256)
const wasm=await loadWasm(binary)
const normalise=r=>r&&({...r,location:Object.fromEntries(Object.entries(r.location).map(([key,p])=>[key,p&&{x:p.x,y:p.y}]))})
const {readPng}=await load('png.js'),readers={base:await load('base/decode.js'),candidate:await load('public/decode.js')},rows=[],failures=[]
const totals={base:0,candidate:0,gained:0,wrong:0},counter=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
const manifestBytes=readFileSync(root+'/vectors/photos.json')
assert.equal(hash(manifestBytes),hash(execFileSync('git',['-C',root,'show','8360eb3b648ebc1d9439684a9f643cc1fb162713:vectors/photos.json'])))
const manifest=JSON.parse(manifestBytes)
assert.equal(manifest.photos.length,184)
for(const photo of manifest.photos){
 const original=readPng(readFileSync(root+'/vectors/photos-cache/grey/'+photo.id+'.png')),raw=readFileSync(root+'/vectors/photos-cache/raw/'+photo.id+'.txt'),expected=new TextDecoder('utf8',{fatal:true}).decode(raw)
 assert.equal(hash(original.data),photo.pixelsSha256);assert.equal(hash(raw),photo.textSha256)
 for(const mirrored of [false,true]){
  let frame={...original,data:original.data.slice()}
  if(mirrored){const before=frame.data.slice();for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++)frame.data[y*frame.width+x]=before[y*frame.width+frame.width-1-x]}
  for(let rotation=0;rotation<4;rotation++){
   for(const inverted of [false,true]){
    const image=inverted?{...frame,data:Uint8Array.from(frame.data,x=>255-x)}:frame,pixels=hash(image.data),results={},row={name:photo.id,rotation,mirrored,inverted,pixelSha256:pixels,readers:{}}
    for(const[name,reader]of Object.entries(readers)){
     const work=counter(),result=reader.decodeCounted(image,{},work);results[name]=result;assert.equal(hash(image.data),pixels)
     if(name==='candidate') {const actual=wasm.decode(image);assert.equal(hash(image.data),pixels);try{assert.deepEqual(normalise(actual),normalise(result))}catch{failures.push({name:photo.id,rotation,mirrored,inverted,issue:'WASM parity'})}}
     if(result&&result.text!==expected){failures.push({name:photo.id,rotation,mirrored,inverted,reader:name,issue:'wrong text'});totals.wrong++}
     if(result)totals[name]++
     assert(work.maps<=720&&work.second<=8&&work.probed<=11500000)
     row.readers[name]={read:!!result,textSha256:result?hash(Buffer.from(result.text)):null,bytesSha256:result?hash(result.bytes):null,work}
    }
    try{assert.deepEqual(row.readers.candidate.work,row.readers.base.work)}catch{failures.push({name:photo.id,rotation,mirrored,inverted,issue:'changed work'})}
    if(results.base){try{assert.deepEqual(results.candidate,results.base)}catch{failures.push({name:photo.id,rotation,mirrored,inverted,issue:'lost or changed previous result'})}}
    else if(results.candidate)totals.gained++
    rows.push(row)
   }
   const {width,height,data}=frame,rotated=new Uint8Array(data.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++)rotated[x*height+height-1-y]=data[y*width+x];frame={data:rotated,width:height,height:width}
  }
 }
}
assert.equal(rows.length,2944)
writeFileSync(output,JSON.stringify({passed:failures.length===0,fullWasmParity:true,wasmSha256:binding.wasmSha256,runnerSha256:hash(readFileSync(new URL(import.meta.url))),binding,identity,totals,failures,rows},null,2)+'\n')
console.log(JSON.stringify({passed:failures.length===0,count:rows.length,totals,failures}));wasm.dispose();if(failures.length)process.exitCode=1



