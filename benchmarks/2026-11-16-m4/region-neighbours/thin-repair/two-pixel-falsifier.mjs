import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {join,resolve} from 'node:path'
if(!process.argv[2]||!process.argv[3])throw Error('Usage: node two-pixel-falsifier.mjs <repaired-build> <old-build>')
const load=(root,p)=>import(pathToFileURL(join(resolve(root),p)).href),thinRoot=process.argv[2],oldRoot=process.argv[3]
const base=await load(thinRoot,'base/decode.js'),thin=await load(thinRoot,'candidate/decode.js'),validation=await load(thinRoot,'validation/decode.js'),old=await load(oldRoot,'candidate/decode.js'),{encode}=await load(thinRoot,'base/encode.js'),{binarise,toLuminance}=await load(thinRoot,'base/binarise.js'),{findFinders,finderTriples}=await load(thinRoot,'base/locate.js')
const hash=x=>createHash('sha256').update(x).digest('hex'),work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0}),qr=encode('A',{version:1,ecc:'H'});
console.log(JSON.stringify({revision:'8fd581bd89bf0c581f8dde925a680d46da0e27aa',description:'two-pixel vertical centre with narrow upper dark; bottom separator extended'}));
for(const pad of [4,5]){
 const side=qr.size+2*pad,modules=new Uint8Array(side*side);
 for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)modules[(y+pad)*side+x+pad]=qr.modules[y*qr.size+x];
 for(const [ox,oy] of [[0,0],[qr.size-7,0],[0,qr.size-7]]){
  for(const y of [2,4])for(let x=2;x<=4;x++)modules[(pad+oy+y)*side+pad+ox+x]=0;
  modules[(pad+oy+2)*side+pad+ox+3]=1;
  for(let x=0;x<=6;x++)modules[(pad+oy+7)*side+pad+ox+x]=1;
 }
 const data=Uint8Array.from(modules,v=>v?20:235),image={data,width:side,height:side};
 const wa=work(),wb=work(),wc=work(),wv=work();globalThis.__finderChecks=0;globalThis.__thinChecks=0;globalThis.__thinTrue=0;
 const a=base.decodeCounted(image,{},wa),b=old.decodeCounted(image,{},wb),c=thin.decodeCounted(image,{},wc),v=validation.decodeCounted(image,{},wv);if(JSON.stringify(c)!==JSON.stringify(v)||JSON.stringify(wc)!==JSON.stringify(wv))throw Error('validation mismatch');
 const bits=binarise(toLuminance(data,side,side,1,side)),observations=[0.5,0.8].map(t=>{const f=findFinders(bits,t);return {tolerance:t,finders:f,triples:finderTriples(bits,f).map(t=>t.map(p=>f.indexOf(p)))}});
 const row={pad,width:side,frameSha256:hash(data),moduleSha256:hash(modules),baseline:a?.text??null,old:b?.text??null,repaired:c?.text??null,baselineWork:wa,oldWork:wb,repairedWork:wc,finderChecks:globalThis.__finderChecks,thinChecks:globalThis.__thinChecks,thinTrue:globalThis.__thinTrue,observations};console.log(JSON.stringify(row));if(a&&(!c||a.text!==c.text))console.error('REPAIRED_LOST',JSON.stringify({pad,base:a.text,repaired:c?.text??null,sha256:row.frameSha256}));
}
