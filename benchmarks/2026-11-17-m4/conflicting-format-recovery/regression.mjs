import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
const [root,build,rivals,output]=process.argv.slice(2)
const hash=b=>createHash('sha256').update(b).digest('hex'),load=p=>import(pathToFileURL(p))
const fd=openSync(output,'wx');closeSync(fd)
const revision='268fa8291e7ba47d93bbccf00a828d69e5a80dc5'
const identity=JSON.parse(readFileSync(build+'/identity.json'));assert.equal(identity.revision,revision)
for(const [variant,files] of Object.entries(identity.generated))for(const [name,sha]of Object.entries(files))assert.equal(hash(readFileSync(build+'/'+variant+'/'+name.replace(/\.ts$/,'.js'))),sha)
const fixtures=['scripts/comparison-fixtures.mjs','vectors/photos.json',...['fresh-stress-unevaluated','overflow-recovery/fresh160'].flatMap(p=>['generate.mjs','photo.mjs','manifest.json'].map(f=>'benchmarks/2026-11-16-m4/'+p+'/'+f))]
const fixtureHashes={}
for(const p of fixtures){const bytes=p==='vectors/photos.json'?execFileSync('git',['-C',root,'show',revision+':'+p]):readFileSync(root+'/'+p);assert.equal(hash(bytes),hash(execFileSync('git',['-C',root,'show',revision+':'+p])));fixtureHashes[p]=hash(bytes)}
process.env.QR_RIVALS=rivals
const ext=createRequire(rivals+'/package.json');assert.equal(ext('qrcode/package.json').version,'1.5.4')
assert.equal(JSON.parse(readFileSync(rivals+'/node_modules/zxing-wasm/package.json')).version,'3.1.7')
const zxBytes=readFileSync(ext.resolve('zxing-wasm/reader/zxing_reader.wasm'));assert.equal(hash(zxBytes),'33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59')
const zx=await load(ext.resolve('zxing-wasm/reader'));await zx.prepareZXingModule({overrides:{wasmBinary:zxBytes},fireImmediately:true})
const readers={base:await load(build+'/base/decode.js'),candidate:await load(build+'/public/decode.js')},counter=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
const {readPng}=await load(build+'/png.js'),{rgba,validationFrames,heldOutFrames}=await load(root+'/scripts/comparison-fixtures.mjs')
const qr=ext('qrcode'),encode=(text,ecc)=>{const q=qr.create(text,{errorCorrectionLevel:ecc});return{size:q.modules.size,modules:q.modules.data}}
const options={formats:['QRCode'],maxNumberOfSymbols:1,tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,textMode:'Plain'}
const suites=[],failures=[]
async function evaluate(name,frames){
 const rows=[],scores={base:{correct:0,miss:0,wrong:0,negativeClean:0,negativeFalse:0},candidate:{correct:0,miss:0,wrong:0,negativeClean:0,negativeFalse:0},zxing:{correct:0,miss:0,wrong:0,negativeClean:0,negativeFalse:0}}
 for(const f of frames){
  const image=f.image,sha=hash(image.data),colour=image.data.length===image.width*image.height*4?image:rgba(image),colourSha=hash(colour.data),values={},row={name:f.name,pixelSha256:sha,rgbaSha256:colourSha,expectedTextSha256:f.text===null?null:hash(Buffer.from(f.text)),readers:{}}
  for(const [reader,api]of Object.entries(readers)){const work=counter();values[reader]=api.decodeCounted(image,{},work);assert(work.maps<=720&&work.second<=(reader==='base'?5:6)&&work.probed<=(reader==='base'?7187500:8625000));row.readers[reader]={work};assert.equal(hash(image.data),sha)}
  values.zxing=(await zx.readBarcodes(colour,options))[0];row.readers.zxing={};assert.equal(hash(colour.data),colourSha)
  for(const [reader,value]of Object.entries(values)){
   const valid=value&&value.text===f.text&&(f.bytes===undefined||Buffer.from(value.bytes).toString('hex')===f.bytes)
   const status=f.text===null?(value?'negativeFalse':'negativeClean'):!value?'miss':valid?'correct':'wrong'
   scores[reader][status]++;Object.assign(row.readers[reader],{status,textSha256:value?hash(Buffer.from(value.text)):null,bytesSha256:value?hash(value.bytes):null})
   if(reader!=='zxing'&&(status==='wrong'||status==='negativeFalse'))failures.push({suite:name,name:f.name,reader,status})
  }
  if(values.base) {
   try{assert.deepEqual(values.candidate,values.base)}catch{failures.push({suite:name,name:f.name,issue:'lost-or-changed-baseline-success'})}
  }
  rows.push(row)
 }
 suites.push({name,count:rows.length,scores,rows});console.log(JSON.stringify({suite:name,count:rows.length,scores,failures:failures.length}))
}
function* photos(){for(const p of JSON.parse(execFileSync('git',['-C',root,'show',revision+':vectors/photos.json'],{encoding:'utf8'})).photos){const raw=readFileSync(root+'/vectors/photos-cache/raw/'+p.id+'.txt');assert.equal(hash(raw),p.textSha256);const image=readPng(readFileSync(root+'/vectors/photos-cache/grey/'+p.id+'.png'));assert.equal(hash(image.data),p.pixelsSha256);yield{name:p.id,image,text:new TextDecoder('utf8',{fatal:true}).decode(raw)}}}
await evaluate('photos184',photos())
for(const [name,path,total]of [['stress256','fresh-stress-unevaluated',256],['previously-qualified160','overflow-recovery/fresh160',160]]){
 const dir=root+'/benchmarks/2026-11-16-m4/'+path,{makeCase}=await load(dir+'/generate.mjs'),manifest=JSON.parse(readFileSync(dir+'/manifest.json'))
 assert.equal(hash(readFileSync(ext.resolve('qrcode'))),manifest.qrcodeMainSha256)
 function* frames(){for(let i=0;i<total;i++){const c=total===256?(i<224?makeCase(Math.floor(i/28),i%28):makeCase(8,i-224)):makeCase(i);assert.deepEqual(c.meta,manifest.cases[i]);assert.equal(hash(c.image.data),c.meta.greySha256);yield{name:c.meta.id,image:c.image,text:c.meta.expectedText,bytes:c.meta.expectedUtf8Hex}}}
 await evaluate(name,frames())
}
for(const [name,frames]of [['validation192',validationFrames(encode)],['synthetic96',heldOutFrames(encode)]])await evaluate(name,frames.map(image=>({name:image.name,image,text:image.expected,bytes:Buffer.from(image.expected).toString('hex')})))
writeFileSync(output,JSON.stringify({passed:failures.length===0,revision,identity,fixtureHashes,runnerSha256:hash(readFileSync(new URL(import.meta.url))),rivalLockSha256:hash(readFileSync(rivals+'/package-lock.json')),zxingWasmSha256:hash(zxBytes),photoOracle:'Exact expected text only; raw payload bytes are not independently supplied.',suites,failures},null,2)+'\n')
if(failures.length)process.exitCode=1
