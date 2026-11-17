import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {cpus,loadavg} from 'node:os'
import {verifyProductionIdentity} from './verify-production-identity.mjs'
assert.equal(process.argv.length,5,'Usage: direct.mjs ROOT ARTIFACTS RIVALS');assert.equal(process.arch,'arm64','Native ARM required')
const [root,build,rivals]=process.argv.slice(2),load=p=>import(pathToFileURL(p)),sha=b=>createHash('sha256').update(b).digest('hex')
const binding=await verifyProductionIdentity(root,build)
const {encode}=await load(root+'/dist/index.js'),{loadWasm}=await load(root+'/dist/wasm.js')
const {timingFrames,summary}=await load(root+'/scripts/comparison-fixtures.mjs')
const ext=createRequire(rivals+'/package.json')
assert.equal(JSON.parse(readFileSync(rivals+'/node_modules/zxing-wasm/package.json')).version,'3.1.7')
const binary=readFileSync(root+'/dist/qr.wasm'),rivalBinary=readFileSync(ext.resolve('zxing-wasm/reader/zxing_reader.wasm'))
assert.equal(sha(binary),binding.wasmSha256)
assert.equal(sha(rivalBinary),'33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59')
const wasm=await loadWasm(binary),zx=await load(ext.resolve('zxing-wasm/reader'))
await zx.prepareZXingModule({overrides:{wasmBinary:rivalBinary},fireImmediately:true})
const options={formats:['QRCode'],maxNumberOfSymbols:1,tryHarder:true,tryRotate:true,tryInvert:true,tryDownscale:true,textMode:'Plain'}
const readers={qr:frame=>wasm.decode(frame),zxing:async frame=>(await zx.readBarcodes(frame,options))[0]}
const digest=createHash('sha256');for(const f of readdirSync(root+'/dist').filter(f=>f.endsWith('.js')).sort())digest.update(f).update(readFileSync(root+'/dist/'+f))
const result={passed:true,binding,node:process.version,arch:process.arch,platform:process.platform,cpu:cpus()[0]?.model,loadBefore:loadavg(),versions:{qr:JSON.parse(readFileSync(root+'/package.json')).version,zxing:'3.1.7'},wasmSha256:sha(binary),zxingWasmSha256:sha(rivalBinary),javascriptSha256:digest.digest('hex'),runnerSha256:sha(readFileSync(new URL(import.meta.url))),fixtureSourceSha256:sha(readFileSync(root+'/scripts/comparison-fixtures.mjs')),options,warmupMinimumPairs:10,warmupMinimumMs:500,measuredPairs:60,cases:[]}
result.linearCapacityBytesBefore=wasm.memoryBytes
try{
 for(const frame of timingFrames(encode)){
  const references={},samples={qr:[],zxing:[]},before=sha(frame.data)
  for(const [name,reader]of Object.entries(readers)){
   const value=await reader(frame)
   assert.equal(value?.text,frame.expected,frame.name+'/'+name)
   if(value)assert.deepEqual(Array.from(value.bytes),Array.from(new TextEncoder().encode(frame.expected)))
   references[name]=value;assert.equal(sha(frame.data),before)
  }
  const pair=async(round,measured)=>{
   for(const name of round%2?['qr','zxing']:['zxing','qr']){
    const start=performance.now(),value=await readers[name](frame),elapsed=performance.now()-start
    assert.deepEqual(value,references[name]);assert.equal(sha(frame.data),before)
    if(measured)samples[name].push(elapsed)
   }
  }
  let rounds=0;const started=performance.now()
  while(rounds<10||performance.now()-started<500)await pair(rounds++,false)
  for(let round=0;round<60;round++)await pair(round,true)
  result.cases.push({name:frame.name,width:frame.width,height:frame.height,rgbaSha256:before,warmupPairs:rounds,...Object.fromEntries(Object.entries(samples).map(([name,values])=>[name,{...summary(values),samplesMs:values}]))})
 }
 result.linearCapacityBytesAfter=wasm.memoryBytes;result.loadAfter=loadavg();console.log(JSON.stringify(result,null,2))
}finally{wasm.dispose()}
