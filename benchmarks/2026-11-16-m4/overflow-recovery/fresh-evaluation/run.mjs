// One-shot, correctness-only fresh160 qualification. No threshold tuning.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,readdirSync,openSync,writeFileSync,closeSync} from 'node:fs'
import {createRequire} from 'node:module'
import {cpus} from 'node:os'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
const [rootArg,buildArg,fixtureArg,rivalsArg,outputArg,flag]=process.argv.slice(2)
assert(process.argv.length===8 && rootArg && buildArg && fixtureArg && rivalsArg && outputArg && flag==='--qualified','Usage: node run.mjs <repo> <build-dir> <fresh160-dir> <rivals> <new-output> --qualified')
const root=resolve(rootArg),build=resolve(buildArg),fixture=resolve(fixtureArg),rivals=resolve(rivalsArg),output=resolve(outputArg)
const expectedBase=process.env.QR_EXPECT_BASE_SHA256,expectedCandidate=process.env.QR_EXPECT_CANDIDATE_SHA256
assert(/^[0-9a-f]{64}$/.test(expectedBase??'') && /^[0-9a-f]{64}$/.test(expectedCandidate??''),'Set QR_EXPECT_BASE_SHA256 and QR_EXPECT_CANDIDATE_SHA256 after known-case and regression gates pass')
assert.notEqual(expectedBase,expectedCandidate,'baseline and candidate must differ')
// Reserve output before fixture generation or any decoder load; a failed run leaves a marker.
const fd=openSync(output,'wx');closeSync(fd)
const hash=x=>createHash('sha256').update(x).digest('hex'),fileHash=p=>hash(readFileSync(p))
const jsHash=d=>{const h=createHash('sha256');for(const f of readdirSync(d).filter(x=>x.endsWith('.js')).sort())h.update(f).update(readFileSync(join(d,f)));return h.digest('hex')}
const baseDir=join(build,'base'),candidateDir=join(build,'candidate'),baseSha256=jsHash(baseDir),candidateSha256=jsHash(candidateDir)
assert.equal(baseSha256,expectedBase,'baseline build identity');assert.equal(candidateSha256,expectedCandidate,'candidate build identity')
const identity=JSON.parse(readFileSync(join(build,'identity.json')))
assert.equal(identity.revision,'c6f05a9808df82365e5999aa5f00951093558a43','builder revision')
assert.equal(identity.jsSha256?.base,baseSha256,'builder baseline identity')
assert.equal(identity.jsSha256?.candidate,candidateSha256,'builder candidate identity')
const hashes={generator:'3a9041fcce7214feb2a35b07bbe9ac909e91785739b112721b8d97053945db96',manifest:'498de1b901b3658923bd050839926933a5ebbcf2455befb6a5f74320ee9cefc8',photo:'06c665a630e8bb6b5bf0196d422154cf855c2fc3fd7299195ec1223865ffa1b4',zxingWasm:'33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59'}
for(const [file,key] of [['generate.mjs','generator'],['manifest.json','manifest'],['photo.mjs','photo']])assert.equal(fileHash(join(fixture,file)),hashes[key],`${file} identity`)
const manifest=JSON.parse(readFileSync(join(fixture,'manifest.json')));assert.equal(manifest.count,160);assert.equal(manifest.cases.length,160)
const external=createRequire(pathToFileURL(join(rivals,'package.json')))
assert.equal(external('qrcode/package.json').version,'1.5.4');assert.equal(fileHash(external.resolve('qrcode')),manifest.qrcodeMainSha256)
assert.equal(JSON.parse(readFileSync(join(rivals,'node_modules/zxing-wasm/package.json'))).version,'3.1.7')
const zxBytes=readFileSync(external.resolve('zxing-wasm/reader/zxing_reader.wasm'));assert.equal(hash(zxBytes),hashes.zxingWasm)
process.env.QR_RIVALS=rivals
const {makeCase}=await import(pathToFileURL(join(fixture,'generate.mjs')))
function materialise(i){const c=makeCase(i);assert.deepEqual(c.meta,manifest.cases[i],`metadata ${i}`);assert.equal(hash(c.image.data),c.meta.greySha256,`pixels ${i}`);assert.equal(c.image.data.length,c.meta.width*c.meta.height,`dimensions ${i}`);return c}
for(let i=0;i<160;i++)materialise(i)
const baseline=await import(pathToFileURL(join(baseDir,'index.js'))),candidate=await import(pathToFileURL(join(candidateDir,'index.js'))),zx=await import(pathToFileURL(external.resolve('zxing-wasm/reader')))
const options={formats:['QRCode'],maxNumberOfSymbols:1,tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,textMode:'Plain'}
await zx.prepareZXingModule({overrides:{wasmBinary:zxBytes},fireImmediately:true})
const readers={baseline:f=>baseline.decode(f),candidate:f=>candidate.decode(f),zxing:async f=>(await zx.readBarcodes(f,options))[0]},names=Object.keys(readers)
const scores=Object.fromEntries(names.map(n=>[n,{positiveCorrect:0,positiveMiss:0,positiveWrong:0,negativeClean:0,negativeFalseRead:0}])),outcomes=[]
for(let i=0;i<160;i++){
 const {meta,image}=materialise(i),rgba=new Uint8ClampedArray(image.data.length*4)
 for(let j=0;j<image.data.length;j++){const v=image.data[j];rgba[j*4]=v;rgba[j*4+1]=v;rgba[j*4+2]=v;rgba[j*4+3]=255}
 const rgbaSha256=hash(rgba),frame={data:rgba,width:image.width,height:image.height},row={id:meta.id,greySha256:meta.greySha256,rgbaSha256,expectedText:meta.expectedText,expectedUtf8Hex:meta.expectedUtf8Hex}
 for(const name of names){
  const value=await readers[name](frame);assert.equal(hash(rgba),rgbaSha256,`${meta.id}/${name} changed input`)
  const present=value!=null,text=present?value.text:null,bytesHex=present&&value.bytes!=null?Buffer.from(value.bytes).toString('hex'):null
  const status=meta.expectedText===null?(present?'negativeFalseRead':'negativeClean'):!present?'positiveMiss':text===meta.expectedText&&bytesHex===meta.expectedUtf8Hex?'positiveCorrect':'positiveWrong'
  scores[name][status]++;row[name]={status,text,bytesHex}
 }
 outcomes.push(row)
}
const lostBaseline=outcomes.filter(r=>r.baseline.status==='positiveCorrect'&&r.candidate.status!=='positiveCorrect').map(r=>r.id)
const candidateErrors=scores.candidate.positiveWrong+scores.candidate.negativeFalseRead
const passed=lostBaseline.length===0&&candidateErrors===0
const receipt={sourceRevision:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim(),explicitQualificationFlag:true,baseSha256,candidateSha256,buildIdentity:identity,buildIdentitySha256:fileHash(join(build,'identity.json')),generatorSha256:hashes.generator,manifestSha256:hashes.manifest,photoSha256:hashes.photo,zxingWasmSha256:hash(zxBytes),rivalLockSha256:fileHash(join(rivals,'package-lock.json')),qrcodeMainSha256:manifest.qrcodeMainSha256,harnessSha256:fileHash(new URL(import.meta.url)),qrcodeVersion:'1.5.4',zxingVersion:'3.1.7',options,node:process.version,arch:process.arch,cpu:cpus()[0]?.model,count:outcomes.length,scores,lostBaseline,passed,outcomes}
writeFileSync(output,JSON.stringify(receipt,null,2)+'\n')
console.log(`Recorded ${outcomes.length} outcomes; passed=${passed}`)
if(!passed)process.exitCode=1
