// Root-only broad shadow screening, after the initial 38-frame diagnostic.
// No policy changes: every original finder and decode continues unchanged.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'

const [rootArg, generatedArg, outputArg] = process.argv.slice(2)
assert(rootArg && generatedArg && outputArg && process.argv.length === 5, 'Supply repo root, generated directory, and new output JSON path')
const root=resolve(rootArg), generated=resolve(generatedArg), output=resolve(outputArg), rivals=process.env.QR_RIVALS
assert(rivals, 'QR_RIVALS is required'); assert(!existsSync(output),'Output already exists')
const sha=b=>createHash('sha256').update(b).digest('hex')
const fileHash=p=>sha(readFileSync(p))
const load=p=>import(pathToFileURL(p))
const revision=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim()
assert(revision.startsWith('5d46849'),'Wrong diagnostic source revision')
const manifestDir=`${root}/benchmarks/2026-11-16-m4/fresh-stress-unevaluated`
const pinned={generator:'18f9a09f86df2c790f60143830bbff8587f5ac82c1c89ea734ef69aa306bde6d',manifest:'ccaa10cce97579506cbeca720fc2752009c5a13fef267a22e59a84d020c0fff9',photo:'06c665a630e8bb6b5bf0196d422154cf855c2fc3fd7299195ec1223865ffa1b4'}
for(const [path,digest] of [['generate.mjs',pinned.generator],['manifest.json',pinned.manifest],['photo.mjs',pinned.photo]]) assert.equal(fileHash(`${manifestDir}/${path}`),digest,`${path} hash`)
const external=createRequire(pathToFileURL(`${resolve(rivals)}/package.json`)), qr=external('qrcode')
assert.equal(external('qrcode/package.json').version,'1.5.4')
const frozen=JSON.parse(readFileSync(`${manifestDir}/manifest.json`))
assert.equal(fileHash(external.resolve('qrcode')),frozen.qrcodeMainSha256,'qrcode identity')
const photos=JSON.parse(readFileSync(`${root}/vectors/photos.json`)).photos
assert.equal(photos.length,184); assert.equal(frozen.cases.length,256)
const base=await load(`${generated}/base/decode.js`), shadow=await load(`${generated}/instrumented/decode.js`)
const {observer}=await load(`${generated}/observer.mjs`)
const {readPng}=await load(`${generated}/png.js`)
const {validationFrames}=await load(`${root}/scripts/comparison-fixtures.mjs`)
const {makeCase}=await load(`${manifestDir}/generate.mjs`)
const generatedFiles=[]
for(const name of ['base','instrumented']) for(const file of readdirSync(`${generated}/${name}`).filter(f=>f.endsWith('.js')).sort()) generatedFiles.push([`${name}/${file}`,fileHash(`${generated}/${name}/${file}`)])
const tools={runner:fileHash(new URL(import.meta.url)),observer:fileHash(`${generated}/observer.mjs`),png:fileHash(`${generated}/png.js`),comparisonFixtures:fileHash(`${root}/scripts/comparison-fixtures.mjs`),photoManifest:fileHash(`${root}/vectors/photos.json`),generator:pinned.generator,manifest:pinned.manifest,photoHelper:pinned.photo,rivalsLock:fileHash(`${resolve(rivals)}/package-lock.json`),qrcodeMain:frozen.qrcodeMainSha256,generatedFiles}
const counter=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
const stats={}, unsupported=[],missingSuccess=[],frameRecords=[]
function check(condition,message) { if(!condition) throw new Error(message) }
function run(suite,name,image,expectedText,expectedBytes,privatePhoto=false) {
 const inputHash=sha(image.data), a=counter(),b=counter(), oldFinders=[],newFinders=[]
 globalThis.__finderOutput=f=>oldFinders.push(structuredClone(f))
 const old=base.decodeCounted(image,{},a)
 check(sha(image.data)===inputHash,`${suite}/${name} baseline modified input`)
 const probe=observer();globalThis.__ring=probe
 globalThis.__finderOutput=f=>newFinders.push(structuredClone(f))
 const now=shadow.decodeCounted(image,{},b)
 check(sha(image.data)===inputHash,`${suite}/${name} shadow modified input`)
 check(isDeepStrictEqual(old,now),`${suite}/${name} result differs`)
 check(isDeepStrictEqual(a,b),`${suite}/${name} work differs`)
 check(isDeepStrictEqual(oldFinders,newFinders),`${suite}/${name} finder output differs`)
 const report=probe.report(), successes=report.successes
 check(Array.isArray(successes),`${suite}/${name} missing success records`)
 const present=old!==undefined, textCorrect=present && old.text===expectedText
 const bytesCorrect=present && expectedBytes!==null && isDeepStrictEqual(Array.from(old.bytes),Array.from(expectedBytes))
 if (present && !textCorrect) throw new Error(`${suite}/${name} decoded unexpected text`)
 if (present && expectedBytes!==null && !bytesCorrect) throw new Error(`${suite}/${name} decoded unexpected bytes`)
 if(expectedText===null && present) throw new Error(`${suite}/${name} unexpected negative read`)
 const bucket=stats[suite] ??= {frames:0,baselineSuccesses:0,misses:0,allSuccessesSupported:0,unsupported:0,missingSuccessRecords:0}
 bucket.frames++
 if(present) {
  bucket.baselineSuccesses++
  if(successes.length===0){bucket.missingSuccessRecords++;missingSuccess.push(`${suite}/${name}`)}
  else if(successes.every(s=>s.supported===true))bucket.allSuccessesSupported++
  else {bucket.unsupported++;unsupported.push({id:`${suite}/${name}`,successes:successes.filter(s=>s.supported!==true)})}
 } else bucket.misses++
 frameRecords.push({suite,id:name,width:image.width,height:image.height,inputSha256:inputHash,expectedTextSha256:expectedText===null?null:sha(Buffer.from(expectedText,'utf8')),
  decodedTextSha256:present?sha(Buffer.from(old.text,'utf8')):null,decodedBytesSha256:present?sha(old.bytes):null,
  found:present,work:a,successes,observer:report,privatePhoto})
}
for(const p of photos) {
 const raw=readFileSync(`${root}/vectors/photos-cache/raw/${p.id}.txt`)
 check(sha(raw)===p.textSha256,`photo ${p.id} text hash`)
 const image=readPng(readFileSync(`${root}/vectors/photos-cache/grey/${p.id}.png`))
 if(p.pixelsSha256)check(sha(image.data)===p.pixelsSha256,`photo ${p.id} pixels`)
 run('photos',p.id,image,new TextDecoder('utf-8',{fatal:true}).decode(raw),null,true)
}
const synth=validationFrames((text,ecc)=>{const x=qr.create(text,{errorCorrectionLevel:ecc});return {size:x.modules.size,modules:x.modules.data}})
check(synth.length===192,'validation fixture count')
for(const f of synth)run('validation',f.name,f,f.expected,new TextEncoder().encode(f.expected))
for(let i=0;i<256;i++) {
 const {meta,image}=i<224?makeCase(Math.floor(i/28),i%28):makeCase(8,i-224)
 check(isDeepStrictEqual(meta,frozen.cases[i]),`fresh case ${i} metadata`)
 check(sha(image.data)===meta.greySha256,`fresh case ${i} pixels`)
 run('fresh',meta.id,image,meta.expectedText,meta.expectedUtf8Hex===null?null:Buffer.from(meta.expectedUtf8Hex,'hex'))
}
writeFileSync(output,JSON.stringify({revision,tools,stats,unsupported,missingSuccess,frames:frameRecords},null,2)+'\n',{flag:'wx'})
console.log(`Recorded ${frameRecords.length} frames in ${output}`)
