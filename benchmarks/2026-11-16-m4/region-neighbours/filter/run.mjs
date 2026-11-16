import { createHash } from 'node:crypto'
import { readFileSync,existsSync,readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'
import { resolve,join } from 'node:path'
import { pathToFileURL } from 'node:url'
if(!process.argv[2]||!process.argv[3])throw Error('Usage: node run.mjs <repo-root> <generated-dir>');
const root=resolve(process.argv[2]),output=resolve(process.argv[3]),load=p=>import(pathToFileURL(join(output,p)).href)
const base=await load('base/decode.js'),candidate=await load('candidate/decode.js'),validation=await load('validation/decode.js');
const {encode}=await load('base/encode.js'),{photograph,prng}=await load('photo.js'),{readPng}=await load('png.js');
const hash=x=>createHash('sha256').update(x).digest('hex'),source=join(output,'snapshot/src');
const sh=createHash('sha256');for(const n of readdirSync(source).filter(n=>n.endsWith('.ts')).sort())sh.update(n).update(readFileSync(join(source,n)));
const cases=[];const add=(name,image,expect)=>cases.push({name,image,expect});
for(const [seed0,width,height] of [[5,1280,720],[5,640,360],[42,640,360]]){let seed=seed0;const data=Uint8Array.from({length:width*height},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24});add(`noise-${seed0}-${width}x${height}`,{data,width,height})}
{const width=1280,height=720,data=new Uint8Array(width*height).fill(230),q=encode('https://example.com/performance/0123456789');for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)if(q.modules[y*q.size+x])for(let dy=0;dy<9;dy++)data.fill(25,(150+y*9+dy)*width+400+x*9,(150+y*9+dy)*width+409+x*9);add('clean',{data,width,height},'https://example.com/performance/0123456789')}
{const width=640,height=360,data=Uint8Array.from({length:width*height},(_,i)=>Math.floor((i%width)/3)%2?230:20);add('stripes',{data,width,height})}
for(const n of ['noise','gradient','finder-tiles','bent-version-4','bent-version-12','close-up-format-damaged','inverted-flat-blocks-mirrored'])add(n,readPng(readFileSync(`${root}/vectors/conformance/${n}.png`)))
const text='https://example.com/finder-damage/0123456789';
for(const [flips,seed,timing] of [[5,10,0],[4,11,0],[4,12,0],[5,10,10]]){const qr=encode(text,{ecc:'H'}),modules=qr.modules.slice(),random=prng(seed*971+flips),order=Array.from({length:49},(_,i)=>i);for(let i=0;i<flips;i++){const j=i+Math.floor(random()*(49-i));[order[i],order[j]]=[order[j],order[i]];const x=order[i]%7,y=Math.floor(order[i]/7);for(const [ox,oy] of [[0,0],[qr.size-7,0],[0,qr.size-7]])modules[(y+oy)*qr.size+x+ox]^=1}for(let i=0;i<timing;i++){const c=8+i;modules[6*qr.size+c]^=1;modules[c*qr.size+6]^=1}add(`finder-damage-${flips}-${seed}-${timing}`,photograph(modules,qr.size,{scale:4,angle:17,shade:.7}),text)}

for(const scale of [1,2]) {const width=1280,height=720,data=new Uint8Array(width*height).fill(230),q=encode('hello',{version:1});for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)if(q.modules[y*q.size+x])for(let j=0;j<scale;j++)data.fill(20,(200+y*scale+j)*width+500+x*scale,(200+y*scale+j)*width+500+(x+1)*scale);add(`module-${scale}-720`,{data,width,height},'hello')}

for(const [scale,blur] of [[2,0],[2,0.4],[3,0.7],[3,1],[4,1],[5,1]]) {const q=encode('rotation-fine-module',{version:3,ecc:'H'});add(`rotated45-scale${scale}-blur${blur}`,photograph(q.modules,q.size,{scale,angle:45,blur}))}

const conformance=JSON.parse(readFileSync(join(root,'vectors/conformance.json'),'utf8'));
for(const entry of conformance.frames)add(`pack-${entry.file}`,readPng(readFileSync(join(root,'vectors',entry.file))));
const photos=JSON.parse(readFileSync(join(root,'vectors/photos.json'),'utf8'));
for(const p of photos.photos){const path=join(root,'vectors/photos-cache/grey',p.id+'.png'),textPath=join(root,'vectors/photos-cache/raw',p.id+'.txt');if(!existsSync(path)||!existsSync(textPath))throw Error('missing photo '+p.id);const bytes=readFileSync(textPath);if(hash(bytes)!==p.textSha256)throw Error('text hash '+p.id);add(`photo-${p.id}`,readPng(readFileSync(path)),new TextDecoder('utf-8',{fatal:true}).decode(bytes))}
for(const crop of [0,1,3]){const q=encode('cropped-finder',{version:3}),scale=3,side=q.size*scale+8,data=new Uint8Array(side*side).fill(230);for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)if(q.modules[y*q.size+x])for(let j=0;j<scale;j++)data.fill(20,(4+y*scale+j)*side+4+x*scale,(4+y*scale+j)*side+4+(x+1)*scale);const w=side-crop,h=side-crop,cut=new Uint8Array(w*h);for(let y=0;y<h;y++)cut.set(data.subarray((y+crop)*side+crop,(y+crop)*side+crop+w),y*w);add(`crop-${crop}`,{data:cut,width:w,height:h})}
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0});
console.log(JSON.stringify({revision:'8fd581bd89bf0c581f8dde925a680d46da0e27aa',sourceSha256:sh.digest('hex'),cases:cases.length}));
for(const {name,image,expect} of cases){const wa=work(),wb=work(),wv=work();globalThis.__finderChecks=0;globalThis.__supportCalls=0;globalThis.__supportShort=0;globalThis.__supportProbes=0;const original=base.decodeCounted(image,{},wa),got=candidate.decodeCounted(image,{},wb),valid=validation.decodeCounted(image,{},wv);if(!isDeepStrictEqual(got,valid)||!isDeepStrictEqual(wb,wv))throw Error(name+' validation divergence');const data=x=>x?.text===undefined?null:hash(Buffer.from(x.text,'utf8'));const expected=expect===undefined?null:hash(Buffer.from(expect,'utf8'));console.log(JSON.stringify({name,width:image.width,height:image.height,frameSha256:hash(image.data),baselineRead:!!original,candidateRead:!!got,baselineTextHash:data(original),candidateTextHash:data(got),expectedTextHash:expected,baselineMatchesExpected:expected===null?null:data(original)===expected,candidateMatchesExpected:expected===null?null:data(got)===expected,fullResultSame:isDeepStrictEqual(original,got),baselineWork:wa,candidateWork:wb,finderChecks:globalThis.__finderChecks,supportCalls:globalThis.__supportCalls,supportShort:globalThis.__supportShort,supportProbes:globalThis.__supportProbes}))}
