// Frozen manifest generation only: no decoder imports or calls.
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { photograph, prng } from './photo.mjs'
const rivals=process.env.QR_RIVALS
if(!rivals) throw Error('QR_RIVALS required')
const require=createRequire(`${rivals}/package.json`), qr=require('qrcode'), qv=require('qrcode/package.json').version
if(qv!=='1.5.4') throw Error('qrcode 1.5.4 required')
const hash=x=>createHash('sha256').update(x).digest('hex')
const versions=[1,2,4,7,12,20,32,40], eccs=['L','M','Q','H']
function balanced(values,seed) {
  const out=Array.from({length:128},(_,i)=>values[i%values.length]),r=prng(seed)
  for(let i=out.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[out[i],out[j]]=[out[j],out[i]]}
  return out
}
const factors={
  rotation:balanced([0,13,37,44,46,73,112,157],0x1da52191),
  scale:balanced([1,1.5,2,2.5,3,4,5,6],0x51cf2a67),
  perspective:balanced([0,.08,.12,.18,.24,.3,.35,.43],0x7c33fa12),
  noise:balanced([0,0,0,5,5,9,12,16],0x19a0b7d3),
  blur:balanced([0,0,0,0,0,0,0,1],0x8a71c461),
  damage:balanced(['none','none','none','none','none','none','centre','occlusion'],0x722be559),
  invert:balanced([false,false,false,true],0x4c798265),
  mirror:balanced([false,false,false,true],0x44f7c6b1),
  distractors:balanced([false,false,true,true],0x5d67e902),
  payload:balanced(['alpha','byte'],0x1e3cdff7),
}
function marker(data,w,h,cx,cy,unit) {
 for(let y=Math.max(0,cy-4*unit);y<Math.min(h,cy+4*unit);y++) for(let x=Math.max(0,cx-4*unit);x<Math.min(w,cx+4*unit);x++) {
  const d=Math.max(Math.abs(x-cx),Math.abs(y-cy))/unit
  if(d<3.5) data[y*w+x]=(d<1.5||d>=2.5)?30:225
 }
}
export function makeCase(i){
 if(!Number.isInteger(i)||i<0||i>=160)throw Error('case index')
 const seed=(0x74cb691d+Math.imul(i+1,0x1635ab))>>>0,r=prng(seed),id=`holdout-${String(i).padStart(3,'0')}`
 if(i>=128){
  const kind=['noise','checker','stripes','finder-tiles'][(i-128)%4],w=144+Math.floor(r()*200),h=144+Math.floor(r()*200),phase=Math.floor(r()*16),cell=2+Math.floor(r()*10),data=new Uint8Array(w*h),markers=[]
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) data[y*w+x]=kind==='noise'?Math.floor(r()*256):kind==='checker'?((Math.floor((x+phase)/cell)+Math.floor((y+phase)/cell))%2?225:30):kind==='stripes'?(Math.floor((x+phase)/cell)%2?225:30):225
  if(kind==='finder-tiles')for(let n=0;n<5;n++){const x=20+Math.floor(r()*(w-40)),y=20+Math.floor(r()*(h-40)),unit=2+Math.floor(r()*3);marker(data,w,h,x,y,unit);markers.push({x,y,unit})}
  return {meta:{id,seed,kind,phase,cell,markers,width:w,height:h,expectedText:null,expectedUtf8Hex:null,greySha256:hash(data)},image:{data,width:w,height:h}}
 }
 const version=versions[Math.floor(i/16)],ecc=eccs[Math.floor(i/4)%4],replicate=i%4
 const alphabet=factors.payload[i]==='byte'?'abcdefghijklmnopqrstuvwxyz0123456789':'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
 const safeBytes = { 1: 7, 2: 14, 4: 34, 7: 64, 12: 100, 20: 100, 32: 100, 40: 100 }[version]
 const length=Math.min(version===1?4+replicate:8+version*2+replicate*3,safeBytes)
 let text='';for(let k=0;k<length;k++)text+=alphabet[Math.floor(r()*alphabet.length)]
 const encoded=qr.create(text,{version,errorCorrectionLevel:ecc}),size=encoded.modules.size,modules=Uint8Array.from(encoded.modules.data),damage=factors.damage[i]
 let damagedFinder=null
 if(damage!=='none'){
  damagedFinder=Math.floor(r()*3);const [ox,oy]=[[0,0],[size-7,0],[0,size-7]][damagedFinder]
  if(damage==='centre')modules[(oy+3)*size+ox+3]=0
  else for(let y=2;y<=3;y++)for(let x=2;x<=3;x++)modules[(oy+y)*size+ox+x]=0
 }
 const shot={scale:factors.scale[i],angle:factors.rotation[i],perspective:factors.perspective[i],seed,noise:factors.noise[i],blur:factors.blur[i],invert:factors.invert[i],mirror:factors.mirror[i]}
 const original=photograph(modules,size,shot),padding=factors.distractors[i]?32:0,w=original.width+padding*2,h=original.height+padding*2,data=new Uint8Array(w*h).fill(200),distractors=[]
 for(let y=0;y<original.height;y++)data.set(original.data.subarray(y*original.width,(y+1)*original.width),(y+padding)*w+padding)
 if(padding)for(const [x,y] of [[12,12],[w-13,12],[12,h-13],[w-13,h-13]]){marker(data,w,h,x,y,2);distractors.push({x,y,unit:2})}
 const image={data,width:w,height:h}
 return {meta:{id,seed,version,ecc,replicate,size,payloadKind:factors.payload[i],shot,damage,damagedFinder,padding,distractorCount:distractors.length,distractors,width:w,height:h,expectedText:text,expectedUtf8Hex:Buffer.from(text).toString('hex'),greySha256:hash(data)},image}
}
if(process.argv[1]&&realpathSync(new URL(import.meta.url))===realpathSync(process.argv[1])){
 const cases=Array.from({length:160},(_,i)=>makeCase(i).meta),seen=new Set(cases.map(c=>c.greySha256))
 if(seen.size!==160)throw Error('duplicate grey frame hash')
 const factorCounts=Object.fromEntries(Object.entries(factors).map(([name,a])=>[name,Object.fromEntries([...new Set(a)].map(v=>[String(v),a.filter(x=>x===v).length]))]))
 const manifest={description:'Fresh perspective, finder and resolution admission set; freeze before any candidate evaluation',count:160,factorCounts,qrcodeVersion:qv,qrcodeMainSha256:hash(readFileSync(require.resolve('qrcode'))),generatorSha256:hash(readFileSync(new URL('./generate.mjs',import.meta.url))),photoSha256:hash(readFileSync(new URL('./photo.mjs',import.meta.url))),cases}
 writeFileSync(new URL('./manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
}
