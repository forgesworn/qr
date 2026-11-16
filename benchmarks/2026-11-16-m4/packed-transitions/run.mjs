import { createHash } from 'node:crypto'
import { readFileSync,readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { deepStrictEqual } from 'node:assert/strict'
import { resolve,join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { observer } from './observer.mjs'
if(!process.argv[2]||!process.argv[3])throw Error('Usage: node run.mjs <repo-root> <generated-dir>');
const root=resolve(process.argv[2]),output=resolve(process.argv[3]),load=p=>import(pathToFileURL(join(output,p)).href)
const base=await load('base/decode.js'),inst=await load('instrumented/decode.js');
const {encode}=await load('base/encode.js'),{photograph,prng}=await load('photo.js'),{readPng}=await load('png.js');
const hash=x=>createHash('sha256').update(x).digest('hex'),source=join(output,'snapshot/src');
const sh=createHash('sha256');for(const n of readdirSync(source).filter(n=>n.endsWith('.ts')).sort())sh.update(n).update(readFileSync(join(source,n)));
const cases=[];const add=(name,image,expect)=>cases.push({name,image,expect});
for(const [seed0,width,height] of [[5,1280,720],[5,640,360],[42,640,360]]){let seed=seed0;const data=Uint8Array.from({length:width*height},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24});add(`noise-${seed0}-${width}x${height}`,{data,width,height})}
{const width=1280,height=720,data=new Uint8Array(width*height).fill(230),q=encode('https://example.com/performance/0123456789');for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)if(q.modules[y*q.size+x])for(let dy=0;dy<9;dy++)data.fill(25,(150+y*9+dy)*width+400+x*9,(150+y*9+dy)*width+409+x*9);add('clean',{data,width,height},'https://example.com/performance/0123456789')}
{const width=640,height=360,data=Uint8Array.from({length:width*height},(_,i)=>Math.floor((i%width)/3)%2?230:20);add('stripes',{data,width,height})}
for(const n of ['noise','gradient','finder-tiles','bent-version-4','bent-version-12','close-up-format-damaged','inverted-flat-blocks-mirrored'])add(n,readPng(readFileSync(`${output}/snapshot/vectors/conformance/${n}.png`)))
for(const [width,height] of [[512,512],[1280,720],[1920,1080]])for(const seed0 of [0x49ad7e32,0x0fe13bc9]){let seed=seed0;const data=Uint8Array.from({length:width*height},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24});add(`negative-${width}x${height}-${seed0.toString(16)}`,{data,width,height})}
for(const pattern of ['stripes','checkerboard','gradient']){const width=1280,height=720,data=new Uint8Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)data[y*width+x]=pattern==='gradient'?Math.round(255*(x+y)/(width+height-2)):pattern==='stripes'?(Math.floor(x/3)%2?230:25):(Math.floor(x/4)+Math.floor(y/4))%2?230:25;add(`negative-${pattern}`,{data,width,height})}
add('blank-1280x720',{data:new Uint8Array(1280*720).fill(200),width:1280,height:720})
const text='https://example.com/finder-damage/0123456789';
for(const [flips,seed,timing] of [[5,10,0],[4,11,0],[4,12,0],[5,10,10]]){const qr=encode(text,{ecc:'H'}),modules=qr.modules.slice(),random=prng(seed*971+flips),order=Array.from({length:49},(_,i)=>i);for(let i=0;i<flips;i++){const j=i+Math.floor(random()*(49-i));[order[i],order[j]]=[order[j],order[i]];const x=order[i]%7,y=Math.floor(order[i]/7);for(const [ox,oy] of [[0,0],[qr.size-7,0],[0,qr.size-7]])modules[(y+oy)*qr.size+x+ox]^=1}for(let i=0;i<timing;i++){const c=8+i;modules[6*qr.size+c]^=1;modules[c*qr.size+6]^=1}add(`finder-damage-${flips}-${seed}-${timing}`,photograph(modules,qr.size,{scale:4,angle:17,shade:.7}),text)}

for(const scale of [1,2]) {const width=1280,height=720,data=new Uint8Array(width*height).fill(230),q=encode('hello',{version:1});for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)if(q.modules[y*q.size+x])for(let j=0;j<scale;j++)data.fill(20,(200+y*scale+j)*width+500+x*scale,(200+y*scale+j)*width+500+(x+1)*scale);add(`module-${scale}-720`,{data,width,height},'hello')}

for(const [scale,blur] of [[2,0],[2,0.4],[3,0.7],[3,1],[4,1],[5,1]]) {const q=encode('rotation-fine-module',{version:3,ecc:'H'});add(`rotated45-scale${scale}-blur${blur}`,photograph(q.modules,q.size,{scale,angle:45,blur}))}
for(const thin of [1,2])for(const pad of [4,5]){const q=encode('A',{version:1,ecc:'H'}),side=q.size+2*pad,m=new Uint8Array(side*side);for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)m[(y+pad)*side+x+pad]=q.modules[y*q.size+x];for(const [ox,oy] of [[0,0],[q.size-7,0],[0,q.size-7]]){for(const y of [2,4])for(let x=2;x<=4;x++)m[(pad+oy+y)*side+pad+ox+x]=0;if(thin===2)m[(pad+oy+2)*side+pad+ox+3]=1;for(let x=0;x<=6;x++)m[(pad+oy+7)*side+pad+ox+x]=1}add(`thin-${thin}-pad-${pad}`,{data:Uint8Array.from(m,v=>v?20:235),width:side,height:side},'A')}
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0});
const toolDir=dirname(fileURLToPath(import.meta.url));const fileHash=p=>hash(readFileSync(p));
console.log(JSON.stringify({revision:execFileSync('git',['rev-parse','104b731868c82d00b6f31a9a853db786b2fd971a'],{cwd:root,encoding:'utf8'}).trim(),sourceSha256:sh.digest('hex'),photoSourceSha256:fileHash(join(output,'snapshot/test/photo.ts')),pngSourceSha256:fileHash(join(output,'snapshot/test/png.ts')),fixtureScriptSha256:fileHash(join(toolDir,'run.mjs')),builderSha256:fileHash(join(toolDir,'build.cjs')),observerSha256:fileHash(join(toolDir,'observer.mjs'))}));
for(const {name,image,expect} of cases){let a=work(),b=work();const baselineFinders=[];globalThis.__finderOutput=f=>baselineFinders.push(structuredClone(f));const frameSha256=hash(image.data);const wanted=base.decodeCounted(image,{},a);if(hash(image.data)!==frameSha256)throw Error(name+' baseline mutated frame');const actualFinders=[];globalThis.__finderOutput=f=>actualFinders.push(structuredClone(f));globalThis.__packed=observer();const got=inst.decodeCounted(image,{},b);if(hash(image.data)!==frameSha256)throw Error(name+' observer mutated frame');deepStrictEqual(actualFinders,baselineFinders,name+" finder lists");deepStrictEqual(got,wanted,name+' result');deepStrictEqual(b,a,name+' work');if(expect!==undefined&&got?.text!==expect)throw Error(name+' expected reading');const obs=globalThis.__packed.report();console.log(JSON.stringify({name,width:image.width,height:image.height,frameSha256,result:got?.text??null,work:b,obs}))}
