import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
const sha=x=>createHash('sha256').update(x).digest('hex')
export async function verifyProductionIdentity(root,base) {
 const revision='b1d95074fb442d87004be1c8bd22b8d8e5c8646f', q=JSON.parse(readFileSync(base+'/qualification.json')), regression=JSON.parse(readFileSync(base+'/regression.json'))
 assert(q.passed && regression.passed);assert.equal(q.suites.reduce((n,s)=>n+s.rows.length,0),1376)
 assert.equal(regression.suites.reduce((n,s)=>n+s.rows.length,0),888)
 assert.deepEqual(q.identity,regression.identity)
 const backendBytes=readFileSync(base+'/production-backends.json'),backend=JSON.parse(backendBytes);assert.equal(backend.passed,true)
 const baseline=JSON.parse(readFileSync(root+'/benchmarks/2026-11-17-m4/selected-mesh-recovery/production-qualified.json'))
 assert.equal(sha(readFileSync(root+'/benchmarks/2026-11-17-m4/selected-mesh-recovery/production-qualified.json')),'e3fd095acf869037599b642807ca03a7657c99080e35cb18abb634a9fa79891b')
 assert.equal(JSON.parse(readFileSync(root+'/package.json')).version,'0.3.14')
 const names=Object.keys(q.identity.sources).sort(); assert.deepEqual(readdirSync(root+'/src').filter(x=>x.endsWith('.ts')).sort(),names)
 assert.deepEqual(readdirSync(root+'/dist').filter(x=>x.endsWith('.js')).sort(),names.map(x=>x.replace(/\.ts$/,'.js')).sort())
 for(const n of names){assert.equal(sha(readFileSync(root+'/src/'+n)),q.identity.sources[n]);assert.equal(sha(readFileSync(root+'/dist/'+n.replace(/\.ts$/,'.js'))),q.identity.generated[n]);assert.equal(sha(execFileSync('git',['-C',root,'show',revision+':src/'+n])),baseline.identity.sources.public[n])}
 const expected=process.env.QR_EXPECTED_WASM_SHA256, size=Number(process.env.QR_EXPECTED_WASM_BYTES), manifest=JSON.parse(readFileSync(root+'/wasm/manifest.json')), wasm=readFileSync(root+'/dist/qr.wasm')
 assert.match(expected??'',/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(size)&&size>0);assert.equal(manifest.sha256,expected);assert.equal(manifest.bytes,size);assert.equal(sha(wasm),expected);assert.equal(wasm.length,size);assert.deepEqual(wasm,readFileSync(root+'/wasm/qr.wasm'))
 assert.equal(backend.count,2264);assert.equal(backend.qualificationSha256,sha(readFileSync(base+'/qualification.json')));assert.equal(backend.regressionSha256,sha(readFileSync(base+'/regression.json')));assert.equal(backend.binding.version,'0.3.14');assert.deepEqual(backend.binding.typescript,q.identity);assert.deepEqual(backend.binding.wasm,manifest)
 const {sourceHash}=await import(pathToFileURL(root+'/scripts/wasm-source.mjs'));assert.equal(sourceHash(),manifest.sourceSha256)
 return {productionBackendsSha256:sha(backendBytes),helperSha256:sha(readFileSync(new URL(import.meta.url))),wasmSha256:expected,wasmBytes:size,manifest,revision,qualificationSha256:sha(readFileSync(base+'/qualification.json')),regressionSha256:sha(readFileSync(base+'/regression.json')),candidateSources:q.identity.sources,candidateJs:q.identity.generated,baselineJs:baseline.identity.generated.public}
}
