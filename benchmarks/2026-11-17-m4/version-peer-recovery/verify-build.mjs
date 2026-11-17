import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const [root,build,prototype,out]=process.argv.slice(2),sha=b=>createHash('sha256').update(b).digest('hex')
const current=JSON.parse(readFileSync(build+'/identity.json')),qualified=JSON.parse(readFileSync(prototype+'/identity.json'))
assert.equal(current.revision,'d6a411ca26f01f9a2b32e7a3e7bcccbbdefc7a63')
assert.deepEqual(current.sources,qualified.sources)
assert.deepEqual(current.generated,qualified.generated)
for(const [name,hash] of Object.entries(current.sources.public))assert.equal(sha(readFileSync(root+'/src/'+name)),hash)
for(const [name,hash] of Object.entries(current.generated.public))assert.equal(sha(readFileSync(root+'/dist/'+name.replace(/\.ts$/,'.js'))),hash,'Distributed JavaScript '+name)
assert.equal(current.sources.public['decode.ts'],'938ade1c3e0ca13051f8e23bb7d04e44742bcab1afc9e8051778ca6d6f6f3ee1')
assert.equal(current.sources.public['symbol.ts'],'2d9861f6f59918cf3b79bb393367ef151c752118426866875846c0ca9f454ca2')
const manifest=JSON.parse(readFileSync(root+'/wasm/manifest.json')),binary=readFileSync(root+'/dist/qr.wasm')
assert.equal(sha(binary),'27bfa219e20a1daa072d19a0bbad468ce945c76b5a3599972c959d98d37ce614')
assert.equal(manifest.sha256,sha(binary));assert.equal(manifest.bytes,binary.length)
const {sourceHash}=await import(pathToFileURL(root+'/scripts/wasm-source.mjs'))
assert.equal(sourceHash(),manifest.sourceSha256)
writeFileSync(out,JSON.stringify({passed:true,baseline:current.revision,sources:current.sources,javascript:current.generated,wasm:manifest,runnerSha256:sha(readFileSync(new URL(import.meta.url)))},null,2)+'\n',{flag:'wx'})
console.log('Final source and distributed JavaScript match qualified prototype; WASM manifest matches Rust sources and bytes')
