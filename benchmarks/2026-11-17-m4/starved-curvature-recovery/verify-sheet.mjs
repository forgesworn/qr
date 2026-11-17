import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const [build,rivals,output]=process.argv.slice(2),load=p=>import(pathToFileURL(build+'/'+p)),hash=b=>createHash('sha256').update(b).digest('hex'),qr=createRequire(rivals+'/package.json')('qrcode')
const readers={base:await load('base/decode.js'),candidate:await load('public/decode.js')},rows=[]
const root=process.argv[5],{loadWasm}=await import(pathToFileURL(root+'/dist/wasm.js')),binary=readFileSync(root+'/dist/qr.wasm'),wasm=await loadWasm(binary)
const normalise=r=>r&&({...r,location:Object.fromEntries(Object.entries(r.location).map(([k,p])=>[k,p&&{x:p.x,y:p.y}]))})
const frozen=JSON.parse(readFileSync(root+'/benchmarks/2026-11-16-m4/inverted-curvature-recovery/sheet.json')).rows
for(const version of [12,24,34])for(const scale of [2,3])for(const amplitude of [6,10,14]){
 const text='SHEET-'+version+'-'+scale+'-'+amplitude+'-'+ '0123456789abcdefghijklmnopqrstuvwxyz'.repeat(version*2).slice(0,({12:220,24:700,34:1300})[version]),encoded=qr.create(text,{version,errorCorrectionLevel:'M'}),size=encoded.modules.size,side=(size+8)*scale,data=new Uint8Array(side*side)
 for(let py=0;py<side;py++)for(let px=0;px<side;px++){
  let sum=0
  for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){
   const x=(px+(sx+.5)/2)/scale-4,y=(py+(sy+.5)/2)/scale-4
   const h=amplitude*Math.sin(Math.PI*(x-3.5)/(size-7)),sourceY=(y-h)/(1-h/size),mx=Math.floor(x),my=Math.floor(sourceY)
   sum+=mx>=0&&my>=0&&mx<size&&my<size&&encoded.modules.data[my*size+mx]?30:225
  }
  data[py*side+px]=Math.floor(sum/4)
 }
 const row={version,scale,amplitude,pixelSha256:hash(data),readers:{}}
 assert.equal(row.pixelSha256,frozen.find(r=>r.version===version&&r.scale===scale&&r.amplitude===amplitude).pixelSha256)
 let previous
 for(const [name,reader]of Object.entries(readers)){
  const work={steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0},result=reader.decodeCounted({data,width:side,height:side},{},work)
  if(result){assert.equal(result.text,text);assert.deepEqual(result.bytes,new TextEncoder().encode(text))}
  assert.equal(hash(data),row.pixelSha256)
  if(name==='base')previous=result
  else if(previous)assert.deepEqual(result,previous,'Complete previous sheet result')
  if(name==='candidate'){const native=wasm.decode({data,width:side,height:side});assert.deepEqual(normalise(native),normalise(result),'complete WASM result');assert.equal(hash(data),row.pixelSha256)}
  assert(work.maps<=720&&work.second<=(name==='base'?4:5)&&work.probed<=(name==='base'?5750000:7187500))
  row.readers[name]={read:!!result,work}
 }
 assert(!row.readers.base.read||row.readers.candidate.read)
 rows.push(row)
}
writeFileSync(output,JSON.stringify({passed:true,fullWasmParity:true,wasmSha256:hash(binary),runnerSha256:hash(readFileSync(new URL(import.meta.url))),identity:JSON.parse(readFileSync(build+'/identity.json')),rows},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(rows.map(r=>({version:r.version,scale:r.scale,amplitude:r.amplitude,base:r.readers.base.read,candidate:r.readers.candidate.read,second:r.readers.candidate.work.second}))))

wasm.dispose()
