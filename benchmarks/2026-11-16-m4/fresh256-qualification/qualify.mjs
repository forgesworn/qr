// Root-only one-shot qualification of the committed unevaluated 256-frame corpus.
// Requires explicit frozen build hashes and external pinned rivals; never writes fixtures.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cpus, loadavg } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const [rootArg, distArg, outputArg] = process.argv.slice(2)
assert(rootArg && distArg && outputArg && process.argv.length === 5, 'Supply repository root, frozen dist directory and new output JSON path')
const root=resolve(rootArg), dist=resolve(distArg), output=resolve(outputArg)
assert(!existsSync(output), `Output already exists: ${output}`)
const rivals=process.env.QR_RIVALS
const expectedJs=process.env.QR_EXPECT_JS_SHA256, expectedWasm=process.env.QR_EXPECT_WASM_SHA256
assert(rivals && expectedJs && expectedWasm, 'Set QR_RIVALS, QR_EXPECT_JS_SHA256 and QR_EXPECT_WASM_SHA256')
const dir=`${root}/benchmarks/2026-11-16-m4/fresh-stress-unevaluated`
const hash=data=>createHash('sha256').update(data).digest('hex')
const fileHash=path=>hash(readFileSync(path))
const jsHash=dir=>{const h=createHash('sha256');for(const f of readdirSync(dir).filter(x=>x.endsWith('.js')).sort())h.update(f).update(readFileSync(`${dir}/${f}`));return h.digest('hex')}
const hashes={generator:'18f9a09f86df2c790f60143830bbff8587f5ac82c1c89ea734ef69aa306bde6d',manifest:'ccaa10cce97579506cbeca720fc2752009c5a13fef267a22e59a84d020c0fff9',photoTs:'d34ab6f88bce5e26342c07a3868577fd73b080379c605e1fd2e8516f85db7bf4',photoJs:'06c665a630e8bb6b5bf0196d422154cf855c2fc3fd7299195ec1223865ffa1b4',zxingWasm:'33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59'}
for(const [file,key] of [['generate.mjs','generator'],['manifest.json','manifest'],['photo.ts','photoTs'],['photo.mjs','photoJs']]) assert.equal(fileHash(`${dir}/${file}`),hashes[key],`${file} identity`)
const manifest=JSON.parse(readFileSync(`${dir}/manifest.json`)); assert.equal(manifest.count,256);assert.equal(manifest.cases.length,256)
const external=createRequire(pathToFileURL(`${resolve(rivals)}/package.json`))
assert.equal(external('qrcode/package.json').version,'1.5.4')
assert.equal(fileHash(external.resolve('qrcode')),manifest.qrcodeMainSha256,'qrcode entry identity')
const actualRivalLockSha256=fileHash(`${resolve(rivals)}/package-lock.json`)
assert.equal(JSON.parse(readFileSync(`${resolve(rivals)}/node_modules/zxing-wasm/package.json`)).version,'3.1.7')
const zxBytes=readFileSync(external.resolve('zxing-wasm/reader/zxing_reader.wasm'))
assert.equal(hash(zxBytes),hashes.zxingWasm,'ZXing WASM identity')
const jsDigest=jsHash(dist), wasmBytes=readFileSync(`${dist}/qr.wasm`), wasmDigest=hash(wasmBytes)
assert.equal(jsDigest,expectedJs,'TS build identity');assert.equal(wasmDigest,expectedWasm,'WASM build identity')
const {makeCase}=await import(pathToFileURL(`${dir}/generate.mjs`))
function materialise(i) {
 const c=i<224 ? makeCase(Math.floor(i/28),i%28) : makeCase(8,i-224)
 assert.deepEqual(c.meta,manifest.cases[i],`fixture metadata ${i}`)
 assert.equal(hash(c.image.data),c.meta.greySha256,`fixture pixels ${i}`)
 assert.equal(c.image.data.length,c.meta.width*c.meta.height,`fixture dimensions ${i}`)
 return c
}
// Verify the entire frozen corpus before loading or invoking any decoder.
for(let i=0;i<256;i++) materialise(i)
const ts=await import(pathToFileURL(`${dist}/index.js`)), adapter=await import(pathToFileURL(`${dist}/wasm.js`))
const wasm=await adapter.loadWasm(wasmBytes)
const zx=await import(pathToFileURL(external.resolve('zxing-wasm/reader')))
const options={formats:['QRCode'],maxNumberOfSymbols:1,tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,textMode:'Plain'}
const readers={typescript:f=>ts.decode(f),wasm:f=>wasm.decode(f),zxing:async f=>(await zx.readBarcodes(f,options))[0]}
const names=Object.keys(readers), outcomes=[], scores=Object.fromEntries(names.map(n=>[n,{positiveCorrect:0,positiveMiss:0,positiveWrong:0,negativeClean:0,negativeFalseRead:0}]))
const loadBefore=loadavg()
try {
 await zx.prepareZXingModule({overrides:{wasmBinary:zxBytes},fireImmediately:true})
 for(let i=0;i<256;i++) {
  const {meta,image}=materialise(i)
  const rgba=new Uint8ClampedArray(image.data.length*4)
  for(let j=0;j<image.data.length;j++){const v=image.data[j];rgba[4*j]=v;rgba[4*j+1]=v;rgba[4*j+2]=v;rgba[4*j+3]=255}
  const rgbaHash=hash(rgba), frame={data:rgba,width:image.width,height:image.height}
  const result={id:meta.id,group:meta.group,greySha256:meta.greySha256,rgbaSha256:rgbaHash,expectedText:meta.expectedText,expectedUtf8Hex:meta.expectedUtf8Hex}
  for(const name of names) {
   const value=await readers[name](frame)
   assert.equal(hash(rgba),rgbaHash,`${meta.id}/${name} input changed`)
   const present=value!=null, text=present?value.text:null
   const bytes=present && value.bytes!=null ? Buffer.from(value.bytes).toString('hex') : null
   let status
   if(meta.expectedText===null) status=present?'negativeFalseRead':'negativeClean'
   else status=!present?'positiveMiss':text===meta.expectedText&&bytes===meta.expectedUtf8Hex?'positiveCorrect':'positiveWrong'
   scores[name][status]++
   result[name]={status,text,bytesHex:bytes}
  }
  outcomes.push(result)
 }
 const groups={}
 for(const row of outcomes) {
  const group=groups[row.group] ??= Object.fromEntries(names.map(name=>[name,{positiveCorrect:0,positiveMiss:0,positiveWrong:0,negativeClean:0,negativeFalseRead:0}]))
  for(const name of names) group[name][row[name].status]++
 }
 const agreement={matching:0,different:[]}
 for(const row of outcomes) {
  const a=row.typescript,b=row.wasm
  if(a.status===b.status && a.text===b.text && a.bytesHex===b.bytesHex) agreement.matching++
  else agreement.different.push(row.id)
 }
 const receipt={sourceRevision:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  dirty:!!execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim(),
  javascriptSha256:jsDigest,wasmSha256:wasmDigest,zxingWasmSha256:hash(zxBytes),generatorSha256:hashes.generator,manifestSha256:hashes.manifest,
  harnessSha256:fileHash(new URL(import.meta.url)),rivalLockSha256:actualRivalLockSha256,frozenGeneratorLockSha256:manifest.rivalLockSha256,qrcodeVersion:'1.5.4',zxingVersion:'3.1.7',options,
  node:process.version,arch:process.arch,cpu:cpus()[0]?.model,loadBefore,loadAfter:loadavg(),count:outcomes.length,scores,groups,typescriptWasmPayloadAgreement:agreement,outcomes}
 writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'})
 console.log(`Recorded ${outcomes.length} outcomes to ${output}`)
} finally { wasm.dispose() }
