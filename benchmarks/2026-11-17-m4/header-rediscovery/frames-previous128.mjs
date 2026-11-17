import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
export function framesFor(rivals){
const ext=createRequire(rivals+'/package.json'),hash=x=>createHash('sha256').update(x).digest('hex')
assert.equal(ext('qrcode/package.json').version,'1.5.4')
const qr=ext('qrcode'),frames=[]
for(const version of [9,17,25,33])for(const scale of [2,3])for(const amplitude of [3,6])for(const sign of [-1,1])for(const axis of ['x','y'])for(const profile of ['parabola','double-wave']){
 const index=frames.length,ecc=index%3===0?'Q':'M'
 let state=(0x73ba5+index*0x9e3779b9)>>>0,text=`STARVATION-HOLDOUT-${index}-`
 for(let k=0;k<Math.floor(version*version*.4);k++){state=(Math.imul(state,1664525)+1013904223)>>>0;text+='0123456789abcdefghijklmnopqrstuvwxyz'[state%36]}
 const q=qr.create(text,{version,errorCorrectionLevel:ecc}),size=q.modules.size,side=(size+12)*scale,data=new Uint8Array(side*side)
 for(let py=0;py<side;py++)for(let px=0;px<side;px++){
  let sum=0
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   let x=(px+(dx+.5)/2)/scale-6,y=(py+(dy+.5)/2)/scale-6
   if(axis==='x')[x,y]=[y,x]
   const u=(x-3.5)/(size-7),shape=profile==='parabola'?4*u*(1-u):Math.sin(2*Math.PI*u),h=sign*amplitude*shape
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
 frames.push({meta:{id:`starvation-holdout-${index}`,version,scale,amplitude,sign,axis,profile,ecc,rotation,inverted,mirrored,pixelSha256:hash(pixels),textSha256:hash(text)},text,image:{data:pixels,width:side,height:side}})
}
assert.equal(frames.length,128)
return frames
}
