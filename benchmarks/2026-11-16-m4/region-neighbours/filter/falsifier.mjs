import { createHash } from 'node:crypto'
import { resolve,join } from 'node:path'
import { pathToFileURL } from 'node:url'
if(!process.argv[2])throw Error('Usage: node falsifier.mjs <generated-dir>')
const load=p=>import(pathToFileURL(join(resolve(process.argv[2]),p)).href)
const base=await load('base/decode.js'),candidate=await load('candidate/decode.js'),validation=await load('validation/decode.js'),{encode}=await load('base/encode.js'),{binarise,toLuminance}=await load('base/binarise.js'),{findFinders,finderTriples}=await load('base/locate.js')
const hash=x=>createHash('sha256').update(x).digest('hex'),work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0});
const text='A',qr=encode(text,{version:1,ecc:'H'}),variants=['symmetric','bottom','top'];
console.log(JSON.stringify({revision:'8fd581bd89bf0c581f8dde925a680d46da0e27aa',description:'version-1 H three finder centres eroded, separator bars extended; padding 4/5, scale 1/2'}));
for(const variant of variants)for(const scale of [1,2])for(const pad of [4,5]){
 const side=(qr.size+2*pad)*scale,data=new Uint8Array(side*side).fill(235),ext=qr.size+2*pad,modules=new Uint8Array(ext*ext);
 for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)modules[(y+pad)*ext+x+pad]=qr.modules[y*qr.size+x];
 const origins=[[0,0],[qr.size-7,0],[0,qr.size-7]];
 for(const [ox,oy] of origins){
  for(const y of [2,4])for(let x=2;x<=4;x++)modules[(pad+oy+y)*ext+pad+ox+x]=0;
  for(const y of variant==='symmetric'?[-1,7]:variant==='bottom'?[7]:[-1])for(let x=0;x<=6;x++)modules[(pad+oy+y)*ext+pad+ox+x]=1;
 }
 for(let y=0;y<ext;y++)for(let x=0;x<ext;x++)if(modules[y*ext+x])for(let dy=0;dy<scale;dy++)data.fill(20,(y*scale+dy)*side+x*scale,(y*scale+dy)*side+(x+1)*scale);
 const image={data,width:side,height:side},wa=work(),wb=work(),wv=work();globalThis.__finderChecks=0;const a=base.decodeCounted(image,{},wa),b=candidate.decodeCounted(image,{},wb),v=validation.decodeCounted(image,{},wv);if(JSON.stringify(b)!==JSON.stringify(v)||JSON.stringify(wb)!==JSON.stringify(wv))throw Error('validation mismatch');
 const bits=binarise(toLuminance(data,side,side,1,side));const observations=[0.5,0.8].map(t=>{const f=findFinders(bits,t);return {tolerance:t,finders:f,triples:finderTriples(bits,f).map(triple=>triple.map(p=>f.indexOf(p)))}});
 const row={variant,scale,pad,width:side,frameSha256:hash(data),moduleSha256:hash(modules),baselineRead:!!a,candidateRead:!!b,baselineText:a?.text??null,candidateText:b?.text??null,baselineWork:wa,candidateWork:wb,finderChecks:globalThis.__finderChecks,observations};console.log(JSON.stringify(row));if(a&&(!b||a.text!==b.text))console.error('LOST_OR_DIFFERENT',JSON.stringify({variant,scale,pad,baseline:a.text,candidate:b?.text??null}));
}
