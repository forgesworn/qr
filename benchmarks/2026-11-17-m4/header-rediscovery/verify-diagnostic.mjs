import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {verifyBuildIdentity} from './verify-build-identity.mjs'
import {framesFor as frames96} from './frames96.mjs'
import {framesFor as frames128} from './frames128.mjs'
import {framesFor as previous128} from './frames-previous128.mjs'
import {framesFor as holdout128} from './frames-holdout.mjs'
import {framesFor as previousFresh} from './frames-previous-fresh.mjs'
import {framesFor as versionPeerFresh} from './frames-fresh.mjs'
import {framesFor as alternateFresh} from './frames-next-fresh.mjs'

if(process.argv.length!==7)throw Error('Usage: node verify-diagnostic.mjs ROOT BUILD RIVALS TRACE NEW_RESULT')
const [root,build,rivals,tracePath,out]=process.argv.slice(2).map(p=>resolve(p))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),json=p=>JSON.parse(readFileSync(p)),load=p=>import(pathToFileURL(p))
const identity=verifyBuildIdentity(root,build),trace=json(tracePath)
assert.equal(trace.passed,true);assert.equal(trace.baseline,identity.revision)
assert.equal(trace.summary.cases,59);assert.equal(trace.summary.controls,39);assert.equal(trace.summary.misses,20)
assert.equal(trace.runnerSha256,hash(readFileSync(new URL('./run.mjs',import.meta.url))))
assert.equal(trace.identity.instrument.instrumentSha256,hash(readFileSync(new URL('./instrument.py',import.meta.url))))
assert.deepEqual(trace.identity.instrument.sourceFiles,identity.sources.base)
assert.deepEqual(trace.baselineJavascript,identity.generated.base)
assert.deepEqual(readdirSync(root+'/dist').filter(n=>n.endsWith('.js')).sort(),Object.keys(identity.generated.base).map(n=>n.replace(/\.ts$/,'.js')).sort())
for(const[n,h]of Object.entries(identity.generated.base))assert.equal(hash(readFileSync(root+'/dist/'+n.replace(/\.ts$/,'.js'))),h)
const releasePath=root+'/benchmarks/2026-11-17-m4/alternate-grid-recovery/production-qualified.json'
assert.equal(trace.releasedReceiptSha256,hash(readFileSync(releasePath)))
const groups=[['known96',frames96,'frames96.mjs'],['known128',frames128,'frames128.mjs'],['previous128',previous128,'frames-previous128.mjs'],['holdout128',holdout128,'frames-holdout.mjs'],['fresh128',previousFresh,'frames-previous-fresh.mjs'],['versionPeerFresh128',versionPeerFresh,'frames-fresh.mjs'],['alternateGridFresh128',alternateFresh,'frames-next-fresh.mjs']]
const frames=new Map()
for(const[name,generate,file]of groups){
 assert.equal(hash(readFileSync(new URL('./'+file,import.meta.url))),trace.inputs.find(g=>g.suite===name).generatorSha256)
 for(const frame of generate(rivals))frames.set(name+'/'+frame.meta.id,frame)
}
const base=await load(build+'/base/decode.js'),candidate=await load(build+'/public/decode.js')
const work=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
const summary=result=>result&&JSON.parse(JSON.stringify({...result,text:undefined,bytes:undefined,textSha256:hash(result.text),bytesSha256:hash(result.bytes)}))
const rows=[]
for(const previous of trace.rows){
 const f=frames.get(previous.group+'/'+previous.id);assert.ok(f)
 assert.equal(hash(f.image.data),previous.pixelSha256)
 const beforeWork=work(),afterWork=work(),before=base.decodeCounted(f.image,{},beforeWork)
 assert.equal(hash(f.image.data),previous.pixelSha256)
 const after=candidate.decodeCounted(f.image,{},afterWork)
 assert.equal(hash(f.image.data),previous.pixelSha256)
 assert.deepEqual(beforeWork,previous.baselineWork);assert.deepEqual(afterWork,beforeWork)
 assert.deepEqual(summary(before),previous.baseline)
 if(before)assert.deepEqual(after,before,'Changed previous full result '+previous.id)
 assert.deepEqual(summary(after),previous.baseline??previous.replay?.result,'Streaming policy differs from diagnostic '+previous.id)
 if(after){assert.equal(after.text,f.text);assert.deepEqual(after.bytes,new TextEncoder().encode(f.text))}
 rows.push({id:previous.id,group:previous.group,base:!!before,candidate:!!after,work:afterWork,pixelSha256:previous.pixelSha256})
}
const gains=rows.filter(r=>!r.base&&r.candidate).map(r=>r.id)
assert.deepEqual(gains,trace.summary.recovered)
writeFileSync(out,JSON.stringify({passed:true,identity,traceSha256:hash(readFileSync(tracePath)),runnerSha256:hash(readFileSync(new URL(import.meta.url))),identityHelperSha256:hash(readFileSync(new URL('./verify-build-identity.mjs',import.meta.url))),cases:rows.length,gains,rows},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({passed:true,cases:rows.length,gains}))
