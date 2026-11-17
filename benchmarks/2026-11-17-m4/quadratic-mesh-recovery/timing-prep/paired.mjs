import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {cpus,loadavg} from 'node:os'
import {pathToFileURL} from 'node:url'
import {verifyProductionIdentity} from './verify-production-identity.mjs'
assert.equal(process.argv.length,8,'Usage: paired.mjs ROOT ARTIFACTS RELEASED_DIST RIVALS MODE BASELINE_WASM')
const [root,base,released,rivals,mode,oldWasm]=process.argv.slice(2), load=p=>import(pathToFileURL(p).href), sha=x=>createHash('sha256').update(x).digest('hex')
assert(['ts','wasm'].includes(mode));const binding=await verifyProductionIdentity(root,base)
const names=Object.keys(binding.baselineJs).sort();assert.deepEqual(readdirSync(released).filter(n=>n.endsWith('.js')).sort(),names.map(n=>n.replace(/\.ts$/,'.js')).sort())
for(const n of names)assert.equal(sha(readFileSync(released+'/'+n.replace(/\.ts$/,'.js'))),binding.baselineJs[n])
const prior=await load(released+'/index.js'),current=await load(root+'/dist/index.js'),{timingFrames,summary}=await load(root+'/scripts/comparison-fixtures.mjs')
const qualified=JSON.parse(readFileSync(base+'/qualification.json')),{corpora}=await load(base+'/corpora.mjs'),{framesFor:validation}=await load(base+'/validation-frames.mjs')
const wanted=new Map([['boundary-unseen-2','gain'],['boundary-unseen-8','gain'],['mesh-retain-unseen-9','gain'],['starvation-holdout-4','gain'],['selected-mesh-holdout-0','gain'],['small-parabola-validation-10','gain'],['small-parabola-validation-15','gain'],['starvation-holdout-42','prior'],['selected-mesh-holdout-39','prior'],['starvation-holdout-16','gain'],['alternate-grid-holdout-16','gain'],['alternate-grid-holdout-18','gain'],['header-rediscovery-holdout-16','gain'],['header-rediscovery-holdout-18','gain']])
const auditBytes=readFileSync(base+'/timing-audit.json'),audit=JSON.parse(auditBytes)
assert.equal(audit.passed,true);assert.equal(audit.cases.length,3)
assert.deepEqual(audit.sourceHashes,qualified.identity.sources);assert.deepEqual(audit.binding.typescript,qualified.identity);assert.deepEqual(audit.binding.wasm,binding.manifest)
assert.equal(audit.cases.filter(c=>c.role==='terminal-miss').length,2)
assert.equal(audit.cases.filter(c=>c.role==='retained-prior-success').length,1)
for(const item of audit.cases)wanted.set(item.id,item.role)
const fixtures=timingFrames(prior.encode).map(f=>({...f,role:'fixed'})),sourceHashes={} 
for(const [name,generator,manifest] of [...corpora,['new256',null,null]]){
 const file=generator?root+'/benchmarks/2026-11-17-m4/selected-mesh-recovery/'+generator:base+'/validation-frames.mjs'
 sourceHashes[name]=sha(readFileSync(file));const frames=generator?(await load(file)).framesFor(rivals):validation(rivals)
 const m=JSON.parse(readFileSync(manifest?root+'/'+manifest:base+'/validation-manifest.json'));assert.deepEqual(frames.map(f=>f.meta),m.cases)
 const suite=qualified.suites.find(s=>s.name===name);assert(suite)
 for(const f of frames){const role=wanted.get(f.meta.id);if(!role)continue
  const row=suite.rows.find(r=>r.id===f.meta.id);assert(row);assert.equal(sha(f.image.data),row.pixelSha256)
  assert.equal(row.readers.base.status,(role==='prior'||role==='retained-prior-success')?'correct':'miss');assert.equal(row.readers.candidate.status,role==='terminal-miss'?'miss':'correct')
  if(role==='terminal-miss'||role==='retained-prior-success'){const item=audit.cases.find(c=>c.id===f.meta.id);assert.equal(item.suite,name);assert.equal(item.pixelSha256,row.pixelSha256);assert.deepEqual(row.readers.base.work,row.readers.candidate.work);if(role==='terminal-miss'){assert.equal(item.terminalEntries,1);assert.equal(item.samplingPasses,1);assert.equal(item.retentions,1)}else {assert.equal(item.retentions,1);assert.equal(item.terminalEntries,0)}}
  fixtures.push({...f.image,name:f.meta.id,expected:role==='terminal-miss'?undefined:f.text,role,meta:f.meta});wanted.delete(f.meta.id)
 }
}
assert.equal(wanted.size,0)
let readers={baseline:prior,candidate:current};const binaries={}
if(mode==='wasm'){
 const {loadWasm}=await load(root+'/dist/wasm.js'),b=readFileSync(oldWasm),c=readFileSync(root+'/dist/qr.wasm')
 assert.equal(sha(b),'8b75949e2dbf5bf968718a8b776c9a8bb8ad8a5f894c6118686ec95efa8258ad');assert.equal(b.length,252923);assert.equal(sha(c),binding.wasmSha256)
 readers={baseline:await loadWasm(b),candidate:await loadWasm(c)};binaries.baseline={sha256:sha(b),bytes:b.length};binaries.candidate={sha256:sha(c),bytes:c.length}
}
const output={binding,mode,binaries,node:process.version,arch:process.arch,platform:process.platform,cpu:cpus()[0]?.model,loadBefore:loadavg(),runnerSha256:sha(readFileSync(new URL(import.meta.url))),fixtureSourceSha256:sha(readFileSync(root+'/scripts/comparison-fixtures.mjs')),sourceHashes,timingAuditSha256:sha(auditBytes),warmupMinimumPairs:10,warmupMinimumMs:500,measuredPairs:60,cases:[],workNote:'Legacy Work excludes the terminal quadratic threshold, sampling and symbol read.'}
if(mode==='wasm')output.linearCapacityBytesBefore=Object.fromEntries(Object.entries(readers).map(([n,r])=>[n,r.memoryBytes]))
try {for(const frame of fixtures){
 const before=sha(frame.data),references={},samples={baseline:[],candidate:[]}
 for(const [name,reader] of Object.entries(readers)){const r=reader.decode(frame);const expected=frame.role==='gain'&&name==='baseline'?undefined:frame.expected;assert.equal(r?.text,expected,frame.name+'/'+name);if(r)assert.deepEqual(Array.from(r.bytes),Array.from(new TextEncoder().encode(expected)));references[name]=r;assert.equal(sha(frame.data),before)}
 if(references.baseline)assert.deepEqual(references.candidate,references.baseline)
 const pair=(round,measured)=>{for(const name of round%2?['baseline','candidate']:['candidate','baseline']){const start=performance.now(),result=readers[name].decode(frame),elapsed=performance.now()-start;assert.deepEqual(result,references[name]);assert.equal(sha(frame.data),before);if(measured)samples[name].push(elapsed)}}
 let n=0;const start=performance.now();while(n<10||performance.now()-start<500)pair(n++,false);for(let i=0;i<60;i++)pair(i,true)
 output.cases.push({name:frame.name,role:frame.role,meta:frame.meta,pixelSha256:before,width:frame.width,height:frame.height,warmupPairs:n,...Object.fromEntries(Object.entries(samples).map(([name,values])=>[name,{...summary(values),samplesMs:values}]))})
}if(mode==='wasm')output.linearCapacityBytesAfter=Object.fromEntries(Object.entries(readers).map(([n,r])=>[n,r.memoryBytes]));output.loadAfter=loadavg();console.log(JSON.stringify(output,null,2))}finally{if(mode==='wasm')for(const reader of Object.values(readers))reader.dispose()}
