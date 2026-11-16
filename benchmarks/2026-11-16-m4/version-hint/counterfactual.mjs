import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { strict as assert } from 'node:assert'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const [rootArg, generatedArg] = process.argv.slice(2)
assert(rootArg && generatedArg && process.argv.length === 4, 'Usage: node counterfactual.mjs <repo-root> <generated-dir>')
const root = resolve(rootArg), dir = resolve(generatedArg), rivals = process.env.QR_RIVALS
assert(rivals, 'QR_RIVALS required')
const hash = x => createHash('sha256').update(x).digest('hex'), fileHash = p => hash(readFileSync(p))
const expected = { 'generate.mjs':'18f9a09f86df2c790f60143830bbff8587f5ac82c1c89ea734ef69aa306bde6d', 'manifest.json':'ccaa10cce97579506cbeca720fc2752009c5a13fef267a22e59a84d020c0fff9', 'photo.ts':'d34ab6f88bce5e26342c07a3868577fd73b080379c605e1fd2e8516f85db7bf4', 'photo.mjs':'06c665a630e8bb6b5bf0196d422154cf855c2fc3fd7299195ec1223865ffa1b4' }
for (const [name,digest] of Object.entries(expected)) assert.equal(fileHash(join(dir,'fixture',name)),digest,name)
const manifest = JSON.parse(readFileSync(join(dir,'fixture/manifest.json'))), ext = createRequire(join(resolve(rivals),'package.json'))
assert.equal(ext('qrcode/package.json').version,'1.5.4'); assert.equal(fileHash(ext.resolve('qrcode')),manifest.qrcodeMainSha256)
const load = p => import(pathToFileURL(join(dir,p)).href)
const {makeCase} = await load('fixture/generate.mjs'), {frame} = await load('fixture/photo.mjs')
const {toLuminance,thresholds,binarise} = await load('base/binarise.js')
const {edgesOf,findFinders,finderTriples,locate} = await load('base/locate.js')
const {versionBits} = await load('base/encode.js'), {counterfactualRead} = await load('base/counterfactual-decode.js')
const {meta,image} = makeCase(7,25); assert.deepEqual(meta,manifest.cases[7*28+25]); assert.equal(meta.id,'blur-noise-25'); assert.equal(hash(image.data),meta.greySha256)
const truthMap = frame(meta.size,meta.shot), truth = [[3.5,3.5],[meta.size-3.5,3.5],[3.5,meta.size-3.5]].map(([x,y])=>truthMap.at(x,y))
const greyHash = hash(image.data), lum = toLuminance(image.data,image.width,image.height,1), bits = binarise(lum,thresholds(lum)), edges = edgesOf(bits)
globalThis.__finderOutput = () => {}
const work = {steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0}, finders = findFinders(bits,0.8,work,edges), triples = finderTriples(bits,finders)
assert(triples.length > 1, 'selected rank 1 is absent'); const triple = triples[1]
const tripleDistances = triple.map(p=>truth.map(t=>Math.hypot(p.x-t.x,p.y-t.y)))
const candidates = []
const popcount = n => { let c=0; for (; n; n &= n-1) c++; return c }
function copyVersion(read, size) {
  const copies = [0,0]
  for(let k=17;k>=0;k--){const i=Math.floor(k/3),j=k%3;copies[0]=(copies[0]<<1)|(read(i,size-11+j)?1:0);copies[1]=(copies[1]<<1)|(read(size-11+j,i)?1:0)}
  return copies.map(bits=>{let best, distance=4;for(let version=7;version<=40;version++){const d=popcount(versionBits(version)^bits);if(d<distance){distance=d;best=version}}return {bits,version:best??null,distance:best===undefined?null:distance}})
}
function sample(location) {
  const [m0,m1,m2,m3,m4,m5,m6,m7,m8]=location.matrix
  return (x,y)=>{const u=x+.5,v=y+.5,w=m6*u+m7*v+m8,px=Math.floor((m0*u+m1*v+m2)/w),py=Math.floor((m3*u+m4*v+m5)/w);return px>=0&&py>=0&&px<bits.width&&py<bits.height&&bits.data[py*bits.width+px]===1}
}
const maps=[]
for(const size of [165,161,169,157,173,177]) {
  const locations = locate(bits,triple,size,work,edges)
  for(let index=0;index<locations.length;index++){
    const location=locations[index], read=sample(location), versions=copyVersion(read,size)
    const result=counterfactualRead(bits,location,false,candidates,false,1)
    const correct=!!result && result.text===meta.expectedText && Buffer.from(result.bytes).toString('hex')===meta.expectedUtf8Hex
    maps.push({size,index,alignment:location.alignment??null,versions,result:result?{text:result.text,bytesHex:Buffer.from(result.bytes).toString('hex'),version:result.version,ecc:result.ecc,mask:result.mask}:null,correct})
  }
}
assert.equal(hash(image.data),greyHash,'input changed')
const own = new URL('.',import.meta.url)
console.log(JSON.stringify({revision:'3c06d8047287994a6e071e87425de1b04cc66d10', privilegedSelection:'normal full-resolution tolerance 0.8, ranked triple index 1; forced size 177', meta,greyHash,truth,triple,tripleDistances,finders:finders.length,triples:triples.length,maps,forcedCorrect:maps.some(m=>m.size===177&&m.correct),work,fixtureHashes:expected,qrcodeMainSha256:manifest.qrcodeMainSha256,rivalLockSha256:fileHash(join(resolve(rivals),'package-lock.json')),sourceSha256:Object.fromEntries(['decode.ts','locate.ts','symbol.ts'].map(f=>[f,fileHash(join(dir,'snapshot/src',f))])),generatedReaderSha256:fileHash(join(dir,'base/counterfactual-decode.js')),builderSha256:fileHash(new URL('counterfactual-build.cjs',own)),runnerSha256:fileHash(new URL('counterfactual.mjs',own))},null,2))
