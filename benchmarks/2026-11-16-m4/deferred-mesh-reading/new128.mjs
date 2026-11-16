import assert from 'node:assert/strict'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const [build,rivals,manifestPath,output]=process.argv.slice(2),hash=x=>createHash('sha256').update(x).digest('hex'),load=p=>import(pathToFileURL(p)),ext=createRequire(rivals+'/package.json')
assert.equal(ext('qrcode/package.json').version,'1.5.4')
const qr=ext('qrcode'),frames=[]
for(const version of [8,15,23,35])for(const scale of [2,4])for(const amplitude of [2,5])for(const sign of [-1,1])for(const axis of ['x','y'])for(const profile of ['parabola','arch']){
 const index=frames.length,ecc=index%3===0?'Q':'M'
 let state=(0x6a27f+index*0x9e3779b9)>>>0,text=`MESH-RETAIN-${index}-`
 for(let k=0;k<Math.floor(version*version*.4);k++){state=(Math.imul(state,1664525)+1013904223)>>>0;text+='0123456789abcdefghijklmnopqrstuvwxyz'[state%36]}
 const q=qr.create(text,{version,errorCorrectionLevel:ecc}),size=q.modules.size,side=(size+12)*scale,data=new Uint8Array(side*side)
 for(let py=0;py<side;py++)for(let px=0;px<side;px++){
  let sum=0
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   let x=(px+(dx+.5)/2)/scale-6,y=(py+(dy+.5)/2)/scale-6
   if(axis==='x')[x,y]=[y,x]
   const u=(x-3.5)/(size-7),shape=profile==='parabola'?4*u*(1-u):Math.sin(Math.PI*u),h=sign*amplitude*shape
   y=(y-h)/(1-h/size)
   if(axis==='x')[x,y]=[y,x]
   const ix=Math.floor(x),iy=Math.floor(y)
   sum+=ix>=0&&iy>=0&&ix<size&&iy<size&&q.modules.data[iy*size+ix]?25:230
  }
  data[py*side+px]=Math.floor(sum/4)
 }
 let pixels=data
 const rotation=index%4,inverted=(Math.floor(index/4)%2)===1,mirrored=(Math.floor(index/8)%2)===1
 if(mirrored){const next=new Uint8Array(pixels.length);for(let y=0;y<side;y++)for(let x=0;x<side;x++)next[y*side+side-1-x]=pixels[y*side+x];pixels=next}
 for(let r=0;r<rotation;r++){
  const next=new Uint8Array(pixels.length)
  for(let y=0;y<side;y++)for(let x=0;x<side;x++)next[x*side+side-1-y]=pixels[y*side+x]
  pixels=next
 }
 if(inverted)pixels=Uint8Array.from(pixels,v=>255-v)
 frames.push({meta:{id:`mesh-retain-unseen-${index}`,version,scale,amplitude,sign,axis,profile,ecc,rotation,inverted,mirrored,pixelSha256:hash(pixels),textSha256:hash(text)},text,image:{data:pixels,width:side,height:side}})
}
assert.equal(frames.length,128)
const identity=JSON.parse(readFileSync(build+'/identity.json'))
if(existsSync(manifestPath))assert.deepEqual(frames.map(x=>x.meta),JSON.parse(readFileSync(manifestPath)).cases)
else writeFileSync(manifestPath,JSON.stringify({sourceCommit:identity.revision,candidate:identity.generated.public['refine.ts'],generatorSha256:hash(readFileSync(new URL(import.meta.url))),encoder:'qrcode@1.5.4',cases:frames.map(x=>x.meta)},null,2)+'\n',{flag:'wx'})
if(process.env.QR_FREEZE_ONLY==='1'){console.log('Frozen '+frames.length+' images before importing decoders');process.exit(0)}
// Freeze all cases before either decoder is imported or run.
const base=await load(build+'/base/decode.js'),candidate=await load(build+'/public/decode.js'),zx=await load(ext.resolve('zxing-wasm/reader')),binary=readFileSync(ext.resolve('zxing-wasm/reader/zxing_reader.wasm'))
assert.equal(hash(binary),'33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59')
await zx.prepareZXingModule({overrides:{wasmBinary:binary},fireImmediately:true})
const rows=[],totals=Object.fromEntries(['base','candidate','zxing'].map(x=>[x,{correct:0,wrong:0,miss:0}])),counter=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
for(const f of frames){
 let previousResult
 const row={...f.meta,readers:{}}
 for(const [name,api]of Object.entries({base,candidate})){
  const work=counter(),r=api.decodeCounted(f.image,{},work),status=!r?'miss':r.text===f.text&&Buffer.from(r.bytes).equals(Buffer.from(f.text))?'correct':'wrong'
  assert.equal(hash(f.image.data),f.meta.pixelSha256);assert(work.maps<=720&&work.second<=4&&work.probed<=5750000)
  row.readers[name]={status,work};totals[name][status]++
  if(name==='base')previousResult=r;else if(previousResult)assert.deepEqual(r,previousResult,'Changed previous success '+f.meta.id)
 }
 const rgba=new Uint8ClampedArray(f.image.data.length*4)
 for(let i=0;i<f.image.data.length;i++){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=f.image.data[i];rgba[i*4+3]=255}
 const r=(await zx.readBarcodes({data:rgba,width:f.image.width,height:f.image.height},{formats:['QRCode'],maxNumberOfSymbols:1,tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,textMode:'Plain'}))[0]
 const status=!r?'miss':r.text===f.text&&Buffer.from(r.bytes).equals(Buffer.from(f.text))?'correct':'wrong'
 row.readers.zxing={status};totals.zxing[status]++;rows.push(row)
}
const losses=rows.filter(r=>r.readers.base.status==='correct'&&r.readers.candidate.status!=='correct').map(r=>r.id),gains=rows.filter(r=>r.readers.base.status!=='correct'&&r.readers.candidate.status==='correct').map(r=>r.id)
writeFileSync(output,JSON.stringify({passed:losses.length===0&&totals.candidate.wrong===0,identity,manifestSha256:hash(readFileSync(manifestPath)),runnerSha256:hash(readFileSync(new URL(import.meta.url))),totals,losses,gains,rows},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({count:rows.length,totals,losses,gains}));if(losses.length||totals.candidate.wrong)process.exitCode=1
