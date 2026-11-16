import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const [root,build,output]=process.argv.slice(2),load=p=>import(pathToFileURL(build+'/'+p)),hash=b=>createHash('sha256').update(b).digest('hex')
const {readPng}=await load('png.js'),original=readPng(readFileSync(root+'/vectors/photos-cache/grey/s2-qrcode-2-high-res-1.png'))
const expected=new TextDecoder('utf8',{fatal:true}).decode(readFileSync(root+'/vectors/photos-cache/raw/s2-qrcode-2-high-res-1.txt'))
const readers={base:await load('base/decode.js'),candidate:await load('public/decode.js')},rows=[]
for(let rotation=0;rotation<4;rotation++)for(const mirrored of [false,true])for(const inverted of [false,true]){
 let image={...original,data:original.data.slice()}
 if(mirrored){const data=image.data.slice();for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)image.data[y*image.width+x]=data[y*image.width+image.width-1-x]}
 for(let r=0;r<rotation;r++){const {data,width,height}=image,next=new Uint8Array(data.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++)next[x*height+height-1-y]=data[y*width+x];image={data:next,width:height,height:width}}
 if(inverted)image.data=Uint8Array.from(image.data,x=>255-x)
 const sha=hash(image.data),row={rotation,mirrored,inverted,pixelSha256:sha,readers:{}}
 for(const [name,api]of Object.entries(readers)){
  const work={steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0},result=api.decodeCounted(image,{},work)
  assert.equal(hash(image.data),sha);if(result)assert.equal(result.text,expected)
  row.readers[name]={read:!!result,bytesSha256:result?hash(result.bytes):null,work}
 }
 assert(!row.readers.base.read||row.readers.candidate.read)
 rows.push(row)
}
writeFileSync(output,JSON.stringify({passed:true,identity:JSON.parse(readFileSync(build+'/identity.json')),runnerSha256:hash(readFileSync(new URL(import.meta.url))),rows},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({base:rows.filter(r=>r.readers.base.read).length,candidate:rows.filter(r=>r.readers.candidate.read).length,total:rows.length}))
