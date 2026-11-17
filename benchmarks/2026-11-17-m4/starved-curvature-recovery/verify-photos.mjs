import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const [root,build,output]=process.argv.slice(2),load=p=>import(pathToFileURL(build+'/'+p)),hash=b=>createHash('sha256').update(b).digest('hex')
const {readPng}=await load('png.js'),readers={base:await load('base/decode.js'),candidate:await load('public/decode.js')},rows=[],failures=[]
const totals={base:0,candidate:0,gained:0,wrong:0},counter=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
const {loadWasm}=await import(pathToFileURL(root+'/dist/wasm.js')),binary=readFileSync(root+'/dist/qr.wasm'),wasm=await loadWasm(binary)
const normalise=r=>r&&({...r,location:Object.fromEntries(Object.entries(r.location).map(([key,p])=>[key,p&&{x:p.x,y:p.y}]))})
for(const photo of JSON.parse(readFileSync(root+'/vectors/photos.json')).photos){
 const original=readPng(readFileSync(root+'/vectors/photos-cache/grey/'+photo.id+'.png')),raw=readFileSync(root+'/vectors/photos-cache/raw/'+photo.id+'.txt'),expected=new TextDecoder('utf8',{fatal:true}).decode(raw)
 assert.equal(hash(original.data),photo.pixelsSha256);assert.equal(hash(raw),photo.textSha256)
 for(const mirrored of [false,true]){
  let frame={...original,data:original.data.slice()}
  if(mirrored){const before=frame.data.slice();for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++)frame.data[y*frame.width+x]=before[y*frame.width+frame.width-1-x]}
  for(let rotation=0;rotation<4;rotation++){
   for(const inverted of [false,true]){
    const image=inverted?{...frame,data:Uint8Array.from(frame.data,x=>255-x)}:frame,pixels=hash(image.data),results={},row={name:photo.id,rotation,mirrored,inverted,pixelSha256:pixels,readers:{}}
    for(const[name,reader]of Object.entries(readers)){
     const work=counter(),result=reader.decodeCounted(image,{},work);results[name]=result;if(name==='candidate')assert.deepEqual(normalise(wasm.decode(image)),normalise(result),'Full WASM result');assert.equal(hash(image.data),pixels)
     if(result&&result.text!==expected){failures.push({name:photo.id,rotation,mirrored,inverted,reader:name,issue:'wrong text'});totals.wrong++}
     if(result)totals[name]++
     assert(work.maps<=720&&work.second<=(name==='base'?4:5)&&work.probed<=(name==='base'?5750000:7187500))
     row.readers[name]={read:!!result,textSha256:result?hash(Buffer.from(result.text)):null,bytesSha256:result?hash(result.bytes):null,work}
    }
    if(results.base){try{assert.deepEqual(results.candidate,results.base)}catch{failures.push({name:photo.id,rotation,mirrored,inverted,issue:'lost or changed previous result'})}}
    else if(results.candidate)totals.gained++
    rows.push(row)
   }
   const {width,height,data}=frame,rotated=new Uint8Array(data.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++)rotated[x*height+height-1-y]=data[y*width+x];frame={data:rotated,width:height,height:width}
  }
 }
}
writeFileSync(output,JSON.stringify({passed:failures.length===0,fullWasmParity:true,wasmSha256:hash(binary),runnerSha256:hash(readFileSync(new URL(import.meta.url))),identity:JSON.parse(readFileSync(build+'/identity.json')),totals,failures,rows},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({passed:failures.length===0,count:rows.length,totals,failures}));if(failures.length)process.exitCode=1


wasm.dispose()
