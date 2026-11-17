import assert from 'node:assert/strict'
import {framesFor as frames128} from './frames128.mjs'
import {framesFor} from './frames96.mjs'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {cpus,loadavg} from 'node:os'
import {pathToFileURL} from 'node:url'
const [root,build,mode,beforeWasm,afterWasm]=process.argv.slice(2),load=p=>import(pathToFileURL(p)),hash=b=>createHash('sha256').update(b).digest('hex')
assert(['ts','wasm'].includes(mode))
const baseline=await load(build+'/base/index.js'),candidate=await load(root+'/dist/index.js'),{timingFrames,summary}=await load(root+'/scripts/comparison-fixtures.mjs'),{readPng}=await load(build+'/png.js')
const fixtures=timingFrames(baseline.encode)
for(const [width,height,seed]of [[512,512,0x671239],[640,360,0x291383],[320,240,0x91425]]){
 let state=seed;const data=Uint8Array.from({length:width*height},()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state>>>24})
 fixtures.push({name:`noise-${width}x${height}`,width,height,data,expected:undefined})
}
const photo=readPng(readFileSync(root+'/vectors/photos-cache/grey/s2-qrcode-2-high-res-1.png')),text=new TextDecoder().decode(readFileSync(root+'/vectors/photos-cache/raw/s2-qrcode-2-high-res-1.txt'))
fixtures.push({name:'curved-photo',...photo,expected:text})
fixtures.push({name:'inverted-curved-photo',...photo,data:Uint8Array.from(photo.data,v=>255-v),expected:text})
fixtures.push({name:'rotated-curved-photo',...photo,data:photo.data.slice().reverse(),expected:text})
const curvedFrames=framesFor(process.env.QR_RIVALS)
for(const index of [32,74,84,24,95,16,87]){const f=curvedFrames[index];fixtures.push({name:index===24?'later-success-mesh':index===95?'curved-miss':index===16||index===87?'prior-mesh-read-'+index:'starved-recovered-'+index,...f.image,expected:index===95?undefined:f.text,addedRead:[32,74,84].includes(index)})}
const mirrored=frames128(process.env.QR_RIVALS)[89];fixtures.push({name:'starved-mirrored-89',...mirrored.image,expected:mirrored.text,addedRead:true})
const readers={baseline,candidate},binaries={}
if(mode==='wasm'){
 const {loadWasm}=await load(root+'/dist/wasm.js');for(const [name,p]of [['baseline',beforeWasm],['candidate',afterWasm]]){const bytes=readFileSync(p);binaries[name]={bytes:bytes.length,sha256:hash(bytes)};readers[name]=await loadWasm(bytes)}
}
const memoryBefore=mode==='wasm'?Object.fromEntries(Object.entries(readers).map(([n,r])=>[n,r.memoryBytes])):undefined
const jsIdentity=dir=>{const digest=createHash('sha256');for(const file of readdirSync(dir).filter(f=>f.endsWith('.js')).sort())digest.update(file).update(readFileSync(dir+'/'+file));return digest.digest('hex')}
const output={mode,node:process.version,cpu:cpus()[0]?.model,loadBefore:loadavg(),runnerSha256:hash(readFileSync(new URL(import.meta.url))),javascript:{baseline:jsIdentity(build+'/base'),candidate:jsIdentity(root+'/dist')},binaries,warmupMinimumPairs:10,warmupMinimumMs:500,measuredPairs:60,cases:[]}
try{
 for(const frame of fixtures){
  const before=hash(frame.data),samples={baseline:[],candidate:[]},references={}
  for(const [name,reader]of Object.entries(readers)){
   const result=reader.decode(frame);assert.equal(result?.text,name==='baseline'&&frame.addedRead?undefined:frame.expected,frame.name+'/'+name)
   references[name]=result;assert.equal(hash(frame.data),before)
  }
  const pair=(round,measured)=>{for(const name of round%2?['baseline','candidate']:['candidate','baseline']){const start=performance.now(),result=readers[name].decode(frame),elapsed=performance.now()-start;assert.deepEqual(result,references[name]);assert.equal(hash(frame.data),before);if(measured)samples[name].push(elapsed)}}
  let rounds=0;const started=performance.now();while(rounds<10||performance.now()-started<500)pair(rounds++,false)
  for(let round=0;round<60;round++)pair(round,true)
  output.cases.push({name:frame.name,pixelSha256:before,width:frame.width,height:frame.height,baselineRead:!!references.baseline,candidateRead:!!references.candidate,warmupPairs:rounds,...Object.fromEntries(Object.entries(samples).map(([name,values])=>[name,{...summary(values),samplesMs:values}]))})
 }
 output.memoryBefore=memoryBefore;output.memoryAfter=mode==='wasm'?Object.fromEntries(Object.entries(readers).map(([n,r])=>[n,r.memoryBytes])):undefined;output.loadAfter=loadavg();console.log(JSON.stringify(output,null,2))
}finally{if(mode==='wasm')for(const r of Object.values(readers))r.dispose()}
