import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
export function framesFor(encode){
const hash=x=>createHash('sha256').update(x).digest('hex'),qr={create:(text,o)=>{const q=encode(text,{version:o.version,ecc:o.errorCorrectionLevel});return{modules:{size:q.size,data:q.modules}}}},frames=[]
for(const version of [10,18,26,38])for(const scale of [2,3,5])for(const amplitude of [3,7])for(const sign of [-1,1])for(const axis of ['x','y']){
 const index=frames.length,ecc=index%3===0?'Q':'M',profile=amplitude===3?'parabola':'double-wave'
 let state=(0x51ee7+index*0x9e3779b9)>>>0,text=`FRESH-BOUNDARY-${index}-`
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
 const rotation=index%4,inverted=(Math.floor(index/4)%2)===1
 for(let r=0;r<rotation;r++){
  const next=new Uint8Array(pixels.length)
  for(let y=0;y<side;y++)for(let x=0;x<side;x++)next[x*side+side-1-y]=pixels[y*side+x]
  pixels=next
 }
 if(inverted)pixels=Uint8Array.from(pixels,v=>255-v)
 frames.push({meta:{id:`boundary-unseen-${index}`,version,scale,amplitude,sign,axis,profile,ecc,rotation,inverted,pixelSha256:hash(pixels),textSha256:hash(text)},text,size,modules:q.modules.data,image:{data:pixels,width:side,height:side}})
}
assert.equal(frames.length,96)

return frames
}
