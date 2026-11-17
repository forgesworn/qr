import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {verifyProduction} from '../production-identity.mjs'
import {corpora} from '../corpora.mjs'
import {framesFor as validation} from '../validation-frames.mjs'
assert.equal(process.argv.length,5,'Usage: run-audit.mjs ROOT ARTIFACTS AUDIT_DIR')
const [root,base,audit]=process.argv.slice(2),sha=x=>createHash('sha256').update(x).digest('hex'),json=p=>JSON.parse(readFileSync(p)),load=p=>import(pathToFileURL(p).href)
assert(!existsSync(base+'/timing-audit.json'))
const binding=await verifyProduction(root,base),qualified=json(base+'/qualification.json'),identity=json(audit+'/identity.json')
assert(identity.typechecked);assert.deepEqual(identity.sourceHashes,qualified.identity.sources)
assert.equal(identity.qualificationSha256,sha(readFileSync(base+'/qualification.json')))
assert.equal(identity.instrumentSha256,sha(readFileSync(new URL('./instrument-audit.py',import.meta.url))))
assert.equal(identity.builderSha256,sha(readFileSync(new URL('./build-audit.cjs',import.meta.url))))
assert.equal(identity.tsconfigSha256,sha(readFileSync(root+'/tsconfig.json')))
const names=Object.keys(identity.sourceHashes).sort()
assert.deepEqual(Object.keys(identity.generated).sort(),names)
assert.deepEqual(readdirSync(audit+'/public').filter(n=>n.endsWith('.js')).sort(),names.map(n=>n.replace(/\.ts$/,'.js')).sort())
for(const n of names){assert.equal(sha(readFileSync(audit+'/src/'+n)),identity.observerSourceHashes[n]);assert.equal(sha(readFileSync(audit+'/public/'+n.replace(/\.ts$/,'.js'))),identity.generated[n])}
const production=await load(root+'/dist/decode.js'),observed=await load(audit+'/public/decode.js')
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
const chosen=[],examined=[];let misses=0,prior=0
try {
 outer:for(const [name,generator,manifest] of [...corpora,['new256',null,null]]){
  const frames=generator?(await load(root+'/benchmarks/2026-11-17-m4/selected-mesh-recovery/'+generator)).framesFor(base+'/rivals'):validation(base+'/rivals')
  assert.deepEqual(frames.map(f=>f.meta),json(manifest?root+'/'+manifest:base+'/validation-manifest.json').cases)
  const suite=qualified.suites.find(s=>s.name===name);assert(suite)
  for(const frame of frames){
   const row=suite.rows.find(r=>r.id===frame.meta.id);assert(row);assert.equal(sha(frame.image.data),row.pixelSha256)
   const counts=[work(),work(),work()],events=[]
   delete globalThis.__qrTimingAudit
   const a=production.decodeCounted(frame.image,{},counts[0]);assert.equal(sha(frame.image.data),row.pixelSha256)
   const b=observed.decodeCounted(frame.image,{},counts[1]);assert.equal(sha(frame.image.data),row.pixelSha256)
   globalThis.__qrTimingAudit=e=>events.push(e.kind)
   const c=observed.decodeCounted(frame.image,{},counts[2]);assert.equal(sha(frame.image.data),row.pixelSha256)
   delete globalThis.__qrTimingAudit
   assert.deepEqual(b,a,frame.meta.id+' hooks-off complete raw result');assert.deepEqual(c,a,frame.meta.id+' hooks-on complete raw result')
   for(const w of counts)assert.deepEqual(w,row.readers.candidate.work,frame.meta.id+' Work')
   const status=!a?'miss':a.text===frame.text&&Buffer.from(a.bytes).equals(Buffer.from(frame.text))?'correct':'wrong'
   assert.equal(status,row.readers.candidate.status);assert.notEqual(status,'wrong')
   const retentions=events.filter(e=>e==='retained').length,terminalEntries=events.filter(e=>e==='terminal').length,samplingPasses=events.filter(e=>e==='sampling').length
   assert(events.every(e=>['retained','terminal','sampling'].includes(e)));assert(retentions<=1&&terminalEntries<=1&&samplingPasses<=terminalEntries)
   assert(!terminalEntries||retentions===1)
   let role
   if(!a&&terminalEntries===1&&samplingPasses===1&&misses<2){role='terminal-miss';misses++}
   else if(a&&row.readers.base.status==='correct'&&retentions===1&&terminalEntries===0&&prior<1){role='retained-prior-success';prior++}
   const entry={suite:name,id:frame.meta.id,pixelSha256:row.pixelSha256,retentions,terminalEntries,samplingPasses,status}
   examined.push(entry);if(role)chosen.push({...entry,role})
   // Clearing the callback must suppress subsequent events; no observer state is retained.
   if(role){const before=events.length,w=work(),again=observed.decodeCounted(frame.image,{},w);assert.deepEqual(again,a);assert.deepEqual(w,counts[0]);assert.equal(events.length,before);assert.equal(sha(frame.image.data),row.pixelSha256)}
   if(misses===2&&prior===1)break outer
  }
 }
 assert.equal(misses,2,'Two actual terminal sampling misses required');assert.equal(prior,1,'Retained descriptor on an earlier success required')
 writeFileSync(base+'/timing-audit.json',JSON.stringify({passed:true,binding,sourceHashes:identity.sourceHashes,observerSourceHashes:identity.observerSourceHashes,instrumentSha256:identity.instrumentSha256,builderSha256:identity.builderSha256,observerIdentity:identity,runnerSha256:sha(readFileSync(new URL(import.meta.url))),selection:'First two sampled terminal misses and first descriptor-retaining prior success in frozen qualification order; no policy changes',cases:chosen,examined},null,2)+'\n',{flag:'wx'})
 console.log(JSON.stringify({passed:true,examined:examined.length,cases:chosen},null,2))
}finally{delete globalThis.__qrTimingAudit}
