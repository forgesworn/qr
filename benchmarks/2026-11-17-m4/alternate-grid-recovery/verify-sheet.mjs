import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {verifyProductionIdentity} from './verify-production-identity.mjs'
assert.equal(process.argv.length, 6, 'usage: node verify-sheet.mjs <root> <build> <rivals> <output>')
const [root,build,rivals,output]=process.argv.slice(2),load=p=>import(pathToFileURL(build+'/'+p)),hash=b=>createHash('sha256').update(b).digest('hex')
const fd=openSync(output,'wx');closeSync(fd)
const binding=await verifyProductionIdentity(root,build)
const identity=binding.identity
const {loadWasm}=await import(pathToFileURL(root+'/dist/wasm.js'))
const binary=readFileSync(root+'/dist/qr.wasm');assert.equal(hash(binary),binding.wasmSha256)
const wasm=await loadWasm(binary)
const normalise=r=>r&&({...r,location:Object.fromEntries(Object.entries(r.location).map(([key,p])=>[key,p&&{x:p.x,y:p.y}]))})
const ext=createRequire(rivals+'/package.json');assert.equal(ext('qrcode/package.json').version,'1.5.4')
const qr=ext('qrcode'),readers={base:await load('base/decode.js'),candidate:await load('public/decode.js')},rows=[]
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
 let baselineResult,baselineWork
 for(const [name,reader]of Object.entries(readers)){
  const work={steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0},result=reader.decodeCounted({data,width:side,height:side},{},work)
  if(result){assert.equal(result.text,text);assert.deepEqual(result.bytes,new TextEncoder().encode(text))}
  assert.equal(hash(data),row.pixelSha256);assert(work.maps<=720&&work.second<=8&&work.probed<=11500000)
  if(name==='candidate'){const actual=wasm.decode({data,width:side,height:side});assert.equal(hash(data),row.pixelSha256);assert.deepEqual(normalise(actual),normalise(result),'Complete WASM result')}
  if(name==='base'){baselineResult=result;baselineWork=work}else {assert.deepEqual(work,baselineWork,'Changed baseline sheet work');if(baselineResult)assert.deepEqual(result,baselineResult,'Changed complete baseline sheet result')}
  row.readers[name]={read:!!result,work}
 }
 assert(!row.readers.base.read||row.readers.candidate.read)
 rows.push(row)
}
writeFileSync(output,JSON.stringify({passed:true,fullWasmParity:true,wasmSha256:binding.wasmSha256,runnerSha256:hash(readFileSync(new URL(import.meta.url))),binding,identity,rows},null,2)+'\n')
console.log(JSON.stringify(rows.map(r=>({version:r.version,scale:r.scale,amplitude:r.amplitude,base:r.readers.base.read,candidate:r.readers.candidate.read,second:r.readers.candidate.work.second}))))



wasm.dispose()
