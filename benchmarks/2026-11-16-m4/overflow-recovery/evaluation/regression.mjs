import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {readFileSync,readdirSync,openSync,writeFileSync,closeSync} from 'node:fs'
import {createRequire} from 'node:module'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
const [rootArg,dirArg,suite,outputArg]=process.argv.slice(2)
assert(rootArg&&dirArg&&suite&&outputArg&&process.argv.length===6,'Usage: node regression.mjs <repo-root> <generated-dir> <perspective|photos|stress256|validation192|synthetic96> <new-receipt.json>')
assert(['perspective','photos','stress256','validation192','synthetic96'].includes(suite),'unknown suite')
const root=resolve(rootArg),dir=resolve(dirArg),rivals=process.env.QR_RIVALS;assert(rivals,'QR_RIVALS required')
const output=resolve(outputArg),outFd=openSync(output,'wx')
const sha=x=>createHash('sha256').update(x).digest('hex'),fileHash=p=>sha(readFileSync(p)),load=p=>import(pathToFileURL(p))
const id=JSON.parse(readFileSync(join(dir,'identity.json'))),rev='c6f05a9808df82365e5999aa5f00951093558a43'
assert.equal(id.revision,rev)
const expectedCandidate={'locate.ts':'d911b106051eb4a4cd7200c42634c18c9b2077e0ebfda12a06be5f3c7f3ec824','decode.ts':'491e43c7cff8ccc5058b77341c7ed074ea2d0453958ac40390e2b1fd9307c02b'}
for(const [f,h] of Object.entries(expectedCandidate))assert.equal(id.sourceSha256.candidate[f],h)
for(const f of Object.keys(id.sourceSha256.base)){
 assert.equal(sha(execFileSync('git',['-C',root,'show',`${rev}:src/${f}`])),id.sourceSha256.base[f],f+' pinned base source')
 if(!expectedCandidate[f])assert.equal(id.sourceSha256.base[f],id.sourceSha256.candidate[f],f+' unexpected candidate source')
}
const dirHash=name=>{const h=createHash('sha256');for(const f of readdirSync(join(dir,name)).filter(x=>x.endsWith('.js')).sort())h.update(f).update(readFileSync(join(dir,name,f)));return h.digest('hex')}
for(const name of ['base','candidate'])assert.equal(dirHash(name),id.jsSha256[name],name+' JS identity')
for(const [f,h] of Object.entries(id.fixtureSha256))assert.equal(fileHash(join(dir,'fixture',f)),h,'fixture '+f)
const pinned={'generate.mjs':'18f9a09f86df2c790f60143830bbff8587f5ac82c1c89ea734ef69aa306bde6d','manifest.json':'ccaa10cce97579506cbeca720fc2752009c5a13fef267a22e59a84d020c0fff9','photo.mjs':'06c665a630e8bb6b5bf0196d422154cf855c2fc3fd7299195ec1223865ffa1b4'}
for(const [f,h] of Object.entries(pinned))assert.equal(fileHash(join(dir,'fixture',f)),h,'frozen '+f)
const external=createRequire(pathToFileURL(join(resolve(rivals),'package.json'))),manifest=JSON.parse(readFileSync(join(dir,'fixture/manifest.json')))
assert.equal(external('qrcode/package.json').version,'1.5.4');assert.equal(fileHash(external.resolve('qrcode')),manifest.qrcodeMainSha256)
assert.equal(JSON.parse(readFileSync(join(resolve(rivals),'node_modules/zxing-wasm/package.json'))).version,'3.1.7')
const zxBytes=readFileSync(external.resolve('zxing-wasm/reader/zxing_reader.wasm'));assert.equal(sha(zxBytes),'33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59')
const base=await load(join(dir,'base/index.js')),candidate=await load(join(dir,'candidate/index.js')),zx=await load(external.resolve('zxing-wasm/reader'))
await zx.prepareZXingModule({overrides:{wasmBinary:zxBytes},fireImmediately:true})
const {makeCase}=await load(join(dir,'fixture/generate.mjs')),{readPng}=await load(join(dir,'fixture/png.js')),{validationFrames,heldOutFrames,rgba}=await load(join(dir,'fixture/comparison-fixtures.mjs'))
const qr=external('qrcode'),encode=(text,ecc)=>{const q=qr.create(text,{errorCorrectionLevel:ecc});return{size:q.modules.size,modules:q.modules.data}}
function* frames(){
if(suite==='perspective'||suite==='stress256'){
 const indexes=suite==='perspective'?[2*28+25]:Array.from({length:256},(_,i)=>i)
 for(const i of indexes){const {meta,image}=i<224?makeCase(Math.floor(i/28),i%28):makeCase(8,i-224);assert.deepEqual(meta,manifest.cases[i]);assert.equal(sha(image.data),meta.greySha256);yield {name:meta.id,image,text:meta.expectedText,bytes:meta.expectedUtf8Hex,privatePhoto:false}}
}else if(suite==='photos'){
 const photos=JSON.parse(readFileSync(join(dir,'fixture/photos.json'))).photos;assert.equal(photos.length,184)
 for(const p of photos){const raw=readFileSync(join(root,'vectors/photos-cache/raw',p.id+'.txt'));assert.equal(sha(raw),p.textSha256,'photo expected-text hash');const image=readPng(readFileSync(join(root,'vectors/photos-cache/grey',p.id+'.png')));if(p.pixelsSha256)assert.equal(sha(image.data),p.pixelsSha256,'photo pixel hash');yield {name:p.id,image,text:new TextDecoder('utf-8',{fatal:true}).decode(raw),bytes:undefined,privatePhoto:true}}
}else{
 const made=suite==='validation192'?validationFrames(encode):heldOutFrames(encode);assert.equal(made.length,suite==='validation192'?192:96)
 for(const image of made)yield {name:image.name,image,text:image.expected,bytes:Buffer.from(image.expected,'utf8').toString('hex'),privatePhoto:false}
}
}
const options={formats:['QRCode'],maxNumberOfSymbols:1,tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,textMode:'Plain'},rows=[],failures=[]
for(const f of frames()){
 const before=sha(f.image.data),rgbaImage=f.image.data.length===f.image.width*f.image.height*4?f.image:rgba(f.image),rgbaBefore=sha(rgbaImage.data)
 const values={};values.base=base.decode(f.image);assert.equal(sha(f.image.data),before,f.name+' base input')
 values.candidate=candidate.decode(f.image);assert.equal(sha(f.image.data),before,f.name+' candidate input')
 values.zxing=(await zx.readBarcodes(rgbaImage,options))[0];assert.equal(sha(rgbaImage.data),rgbaBefore,f.name+' zxing input');assert.equal(sha(f.image.data),before,f.name+' original input')
 const rec={name:f.name,width:f.image.width,height:f.image.height,inputSha256:before,rgbaSha256:rgbaBefore,expectedTextSha256:f.text===null?null:sha(Buffer.from(f.text,'utf8')),readers:{}}
 for(const [name,value] of Object.entries(values)){
  const present=value!=null,text=present?value.text:null,bytes=present&&value.bytes!=null?Buffer.from(value.bytes).toString('hex'):null
  const valid=!present||f.text!==null&&text===f.text&&(f.bytes===undefined||bytes===f.bytes)
  const status=!present?(f.text===null?'negative-clean':'miss'):valid?'correct':f.text===null?'negative-false-read':'wrong'
  rec.readers[name]={status,textSha256:present?sha(Buffer.from(text,'utf8')):null,bytesSha256:bytes===null?null:sha(Buffer.from(bytes,'hex'))}
  if(!f.privatePhoto){rec.readers[name].text=text;rec.readers[name].bytesHex=bytes}
  if(name!=='zxing'&&!valid)failures.push({name:f.name,reader:name,issue:status})
 }
 if(values.base!=null&&(values.candidate==null||values.base.text!==values.candidate.text||Buffer.from(values.base.bytes).toString('hex')!==Buffer.from(values.candidate.bytes).toString('hex')))failures.push({name:f.name,reader:'candidate',issue:'lost-or-changed-baseline-success'})
 if(suite==='perspective'&&rec.readers.candidate.status!=='correct')failures.push({name:f.name,reader:'candidate',issue:'expected-perspective-recovery-missing'})
 rows.push(rec)
}
const receipt={revision:rev,suite,passed:failures.length===0,baseJsSha256:id.jsSha256.base,candidateJsSha256:id.jsSha256.candidate,identity:id,identitySha256:fileHash(join(dir,'identity.json')),runnerSha256:fileHash(new URL(import.meta.url)),rivalLockSha256:fileHash(join(resolve(rivals),'package-lock.json')),zxingWasmSha256:sha(zxBytes),qrcodeMainSha256:manifest.qrcodeMainSha256,photoOracle:'text only; expected raw QR payload bytes are not supplied',node:process.version,arch:process.arch,count:rows.length,failures,rows}
writeFileSync(outFd,JSON.stringify(receipt,null,2)+'\n');closeSync(outFd);if(failures.length)process.exitCode=1
