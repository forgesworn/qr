import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const json=path=>JSON.parse(readFileSync(path))
const baseline='0fdcd6262f0cd5ddcd7ec6bfba5d131df01c9a37'
const prototypeSha='df1450b6e39d5dba5d82cef87adab980411f19c8efcf1f14c157605155fedd1e'

/** Bind final source, generated/distributed JS and WASM before decoder loading. */
export async function verifyProductionIdentity(rootPath,buildPath,prototypeBuild) {
  const root=resolve(rootPath),build=resolve(buildPath)
  const identity=json(build+'/identity.json')
  const qualifiedPath=new URL('./qualification.json',import.meta.url),qualified=json(qualifiedPath)
  assert.equal(qualified.passed,true,'Missing successful frozen prototype qualification')
  const completionPath=new URL('./qualification-completion.json',import.meta.url),completion=json(completionPath)
  assert.equal(completion.passed,true);assert.equal(completion.exitCode,0)
  assert.equal(completion.curveCases,1120);assert.equal(completion.regressionCases,888);assert.equal(completion.negativeControls,64)
  assert.equal(completion.photoViews,2944);assert.equal(completion.sheets,18)
  for(const name of ['qualification.json','regression.json','photos.json','sheet.json']) {
    const bytes=readFileSync(new URL('./'+name,import.meta.url)),receipt=JSON.parse(bytes)
    assert.equal(sha(bytes),completion.files[name],'Qualification completion hash '+name)
    assert.equal(receipt.passed,true,'Failed prototype gate '+name)
    assert.deepEqual(receipt.identity.sources,qualified.identity.sources,'Gate source identity '+name)
    assert.deepEqual(receipt.identity.generated,qualified.identity.generated,'Gate JS identity '+name)
  }
  const expectedWasmSha256=process.env.QR_EXPECTED_WASM_SHA256
  const expectedWasmBytes=Number(process.env.QR_EXPECTED_WASM_BYTES)
  assert.match(expectedWasmSha256??'',/^[a-f0-9]{64}$/,'Set exact final QR_EXPECTED_WASM_SHA256')
  assert(Number.isSafeInteger(expectedWasmBytes)&&expectedWasmBytes>0,'Set exact final QR_EXPECTED_WASM_BYTES')
  assert.equal(json(root+'/package.json').version,'0.3.13')
  assert.equal(qualified.suites.reduce((n,s)=>n+s.rows.length,0),1120)
  assert.equal(identity.revision,baseline)
  assert.equal(identity.prototype.revision,baseline)
  assert.equal(identity.prototype.prototypeSha256,prototypeSha)
  assert.equal(sha(readFileSync(new URL('./prototype.py',import.meta.url))),prototypeSha)
  assert.deepEqual(identity.prototype,qualified.identity.prototype)
  assert.deepEqual(identity.sources,qualified.identity.sources,'Production source changed after prototype qualification')
  assert.deepEqual(identity.generated,qualified.identity.generated,'Production JavaScript changed after prototype qualification')
  if(prototypeBuild) {
    const previous=json(resolve(prototypeBuild)+'/identity.json')
    assert.deepEqual(previous,qualified.identity,'Supplied prototype build differs from qualification')
  }
  assert.equal(identity.builderSha256,sha(readFileSync(new URL('./build-production.cjs',import.meta.url))))
  assert.equal(identity.typecheck.passed,true)
  assert.equal(identity.typecheck.diagnostics,0)
  assert.equal(identity.compiler,createRequire(root+'/package.json')('typescript/package.json').version)
  assert.equal(identity.typecheck.tsconfigSha256,sha(readFileSync(root+'/tsconfig.json')))
  assert.equal(identity.typecheck.packageJsonSha256,sha(readFileSync(root+'/package.json')))
  assert.equal(identity.typecheck.packageJsonSha256,sha(readFileSync(build+'/package.json')))
  const names=Object.keys(identity.sources.public).sort()
  assert.deepEqual(readdirSync(root+'/src').filter(n=>n.endsWith('.ts')).sort(),names)
  for(const name of names) {
    assert.equal(sha(readFileSync(root+'/src/'+name)),identity.sources.public[name],'Production source '+name)
    assert.equal(sha(execFileSync('git',['-C',root,'show',baseline+':src/'+name])),identity.sources.base[name],'Baseline source '+name)
  }
  for(const variant of ['base','public']) {
    assert.deepEqual(Object.keys(identity.generated[variant]).sort(),names)
    assert.deepEqual(readdirSync(build+'/'+variant).filter(n=>n.endsWith('.js')).sort(),names.map(n=>n.replace(/\.ts$/,'.js')).sort())
    for(const name of names) {
      assert.equal(sha(readFileSync(build+'/check-'+variant+'/'+name)),identity.sources[variant][name])
      assert.equal(sha(readFileSync(build+'/'+variant+'/'+name.replace(/\.ts$/,'.js'))),identity.generated[variant][name])
    }
  }
  assert.deepEqual(readdirSync(root+'/dist').filter(n=>n.endsWith('.js')).sort(),names.map(n=>n.replace(/\.ts$/,'.js')).sort())
  for(const name of names)
    assert.equal(sha(readFileSync(root+'/dist/'+name.replace(/\.ts$/,'.js'))),identity.generated.public[name],'Distributed JS '+name)
  assert.equal(sha(readFileSync(build+'/png.js')),identity.helpers.pngJsSha256)
  const wasm=json(root+'/wasm/manifest.json'),binary=readFileSync(root+'/dist/qr.wasm')
  assert.equal(wasm.abi,2)
  assert.equal(wasm.sha256,expectedWasmSha256)
  assert.equal(wasm.bytes,expectedWasmBytes)
  assert.equal(sha(binary),wasm.sha256)
  assert.equal(binary.length,wasm.bytes)
  assert.deepEqual(readFileSync(root+'/wasm/qr.wasm'),binary)
  const {sourceHash}=await import(pathToFileURL(root+'/scripts/wasm-source.mjs').href)
  assert.equal(sourceHash(),wasm.sourceSha256,'WASM source manifest')
  return {identity,wasm,wasmSha256:sha(binary),wasmBytes:binary.length,expectedWasmSha256,expectedWasmBytes,
    qualificationCompletionSha256:sha(readFileSync(completionPath)),
    qualifiedReceiptSha256:sha(readFileSync(qualifiedPath)),helperSha256:sha(readFileSync(new URL(import.meta.url)))}
}
