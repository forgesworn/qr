import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { deepStrictEqual } from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
if(!process.argv[2] || !process.argv[3]) throw Error('Usage: node run.mjs <repo-root> <generated-dir>');
const root=resolve(process.argv[2]),output=resolve(process.argv[3]);
const load=path=>import(pathToFileURL(join(output,path)).href);
const base=await load('base/decode.js'),inst=await load('instrumented/decode.js');
const {encode, FORMAT_COORDS, EC_ORDER, formatBits}=await load('base/encode.js');
const {photograph,prng}=await load('photo.js');
const {readPng}=await load('png.js'); const hash=x=>createHash('sha256').update(x).digest('hex')
const sh=createHash('sha256');for(const n of readdirSync(root+'/src').filter(n=>n.endsWith('.ts')).sort())sh.update(n).update(readFileSync(root+'/src/'+n))
const words=EC_ORDER.flatMap(e=>(Array.from({length:8},(_,m)=>formatBits(e,m))))
const pop=n=>{let c=0;for(;n;n&=n-1)c++;return c}
function observer(){let strict=false,scale=1,inverted=false,current=null;const records=[];
 return {
  pass(s,f,i){strict=s;scale=f;inverted=i},
  enter(image){current={image,strict,scale,inverted,windows:0,scanned:0,runs:0,vertical:0,reads:0}},
  window(area){current.windows++;current.scanned+=area}, run(){current.runs++}, vertical(){current.vertical++}, readMap(){current.reads++},
  exit(locations){if(!locations.length)throw Error('no map'); const image=current.image,size=locations[0].size;const ones=[0,0,0,0],zeros=[0,0,0,0];
   for(const map of locations)for(let orient=0;orient<2;orient++)for(let copy=0;copy<2;copy++)for(let i=0;i<15;i++){
    let [x,y]=copy===0?FORMAT_COORDS[i]:i<8?[size-1-i,8]:[8,size-7+(i-8)]; if(orient)[x,y]=[y,x];
    const p=map.project(x,y),px=Math.floor(p.x),py=Math.floor(p.y),v=px>=0&&py>=0&&px<image.width&&py<image.height&&image.data[py*image.width+px]===1,j=orient*2+copy;
    if(v)ones[j]|=1<<i;else zeros[j]|=1<<i;
   }
   const unknown=ones.map((v,i)=>v&zeros[i]);
   const distance=(j,w)=>pop((ones[j]^w)&~unknown[j]&0x7fff);
   const ordinary=words.some(w=>[0,1,2,3].some(j=>distance(j,w)<=3));
   const stringent=words.some(w=>(distance(0,w)<=2&&distance(1,w)<=2)||(distance(2,w)<=2&&distance(3,w)<=2));
   Object.assign(current,{maps:locations.length,ordinaryReject:!ordinary,strictReject:!stringent,unknownBits:unknown.map(pop)});records.push(current);
  },
  report(){const sum=rs=>({locates:rs.length,windows:rs.reduce((a,r)=>a+r.windows,0),scanned:rs.reduce((a,r)=>a+r.scanned,0),runs:rs.reduce((a,r)=>a+r.runs,0),vertical:rs.reduce((a,r)=>a+r.vertical,0),emittedMaps:rs.reduce((a,r)=>a+r.maps,0),readMaps:rs.reduce((a,r)=>a+r.reads,0)});const actual=records.filter(r=>r.strict?r.strictReject:r.ordinaryReject);return {all:sum(records),ordinaryUpper:sum(records.filter(r=>r.ordinaryReject)),strictUpper:sum(records.filter(r=>r.strictReject)),actualUpper:sum(actual),ordinaryPasses:sum(records.filter(r=>!r.strict)),strictPasses:sum(records.filter(r=>r.strict)),unknownBitRanges:[0,1,2,3].map(i=>records.length?[Math.min(...records.map(r=>r.unknownBits[i])),Math.max(...records.map(r=>r.unknownBits[i]))]:null)}}
 }
}
const cases=[];const add=(name,image,expect)=>cases.push({name,image,expect});
for(const [seed0,width,height] of [[5,1280,720],[5,640,360],[42,640,360]]){let seed=seed0;const data=Uint8Array.from({length:width*height},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24});add(`noise-${seed0}-${width}x${height}`,{data,width,height})}
{const width=1280,height=720,data=new Uint8Array(width*height).fill(230),q=encode('https://example.com/performance/0123456789');for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)if(q.modules[y*q.size+x])for(let dy=0;dy<9;dy++)data.fill(25,(150+y*9+dy)*width+400+x*9,(150+y*9+dy)*width+409+x*9);add('clean',{data,width,height},'https://example.com/performance/0123456789')}
{const width=640,height=360,data=Uint8Array.from({length:width*height},(_,i)=>Math.floor((i%width)/3)%2?230:20);add('stripes',{data,width,height})}
for(const n of ['noise','gradient','finder-tiles','bent-version-4','bent-version-12','close-up-format-damaged','inverted-flat-blocks-mirrored'])add(n,readPng(readFileSync(`${root}/vectors/conformance/${n}.png`)))
const text='https://example.com/finder-damage/0123456789';
for(const [flips,seed,timing] of [[5,10,0],[4,11,0],[4,12,0],[5,10,10]]){const qr=encode(text,{ecc:'H'}),modules=qr.modules.slice(),random=prng(seed*971+flips),order=Array.from({length:49},(_,i)=>i);for(let i=0;i<flips;i++){const j=i+Math.floor(random()*(49-i));[order[i],order[j]]=[order[j],order[i]];const x=order[i]%7,y=Math.floor(order[i]/7);for(const [ox,oy] of [[0,0],[qr.size-7,0],[0,qr.size-7]])modules[(y+oy)*qr.size+x+ox]^=1}for(let i=0;i<timing;i++){const c=8+i;modules[6*qr.size+c]^=1;modules[c*qr.size+6]^=1}add(`finder-damage-${flips}-${seed}-${timing}`,photograph(modules,qr.size,{scale:4,angle:17,shade:.7}),text)}
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0});
console.log(JSON.stringify({revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceSha256:sh.digest('hex')}));
for(const {name,image,expect} of cases){let a=work(),b=work();const wanted=base.decodeCounted(image,{},a);globalThis.__formatObs=observer();const got=inst.decodeCounted(image,{},b);deepStrictEqual(got,wanted,name+' result');deepStrictEqual(b,a,name+' work');if(expect!==undefined&&got?.text!==expect)throw Error(name+' expected reading');const obs=globalThis.__formatObs.report();if(obs.all.scanned!==b.scanned)throw Error(name+' scanned mismatch');console.log(JSON.stringify({name,width:image.width,height:image.height,frameSha256:hash(image.data),result:got?.text??null,work:b,obs}))}
