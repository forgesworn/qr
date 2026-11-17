import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
const hash=b=>createHash('sha256').update(b).digest('hex'),json=p=>JSON.parse(readFileSync(p))
export async function verifyProduction(root,base,freeze=false){
 const candidate=json(base+'/prototype-build/identity.json'),qualification=json(base+'/qualification.json'),functional=json(base+'/functional.json')
 assert(qualification.passed&&functional.passed);assert.deepEqual(qualification.identity,candidate)
 const old=json(root+'/benchmarks/2026-11-17-m4/selected-mesh-recovery/production-qualified.json')
 for(const [directory,files,extension]of [[root+'/src',candidate.sources,'.ts'],[root+'/dist',candidate.generated,'.js'],[base+'/released-dist',old.identity.generated.public,'.js']]){
  assert.deepEqual(readdirSync(directory).filter(n=>n.endsWith(extension)).sort(),Object.keys(files).map(n=>n.replace(/\.ts$/,extension)).sort())
  for(const [n,h]of Object.entries(files))assert.equal(hash(readFileSync(directory+'/'+n.replace(/\.ts$/,extension))),h,directory+'/'+n)
 }
 const wasm=json(root+'/wasm/manifest.json'),binary=readFileSync(root+'/dist/qr.wasm');assert.equal(hash(binary),wasm.sha256);assert.equal(binary.length,wasm.bytes)
 assert.deepEqual(binary,readFileSync(root+'/wasm/qr.wasm'));assert.deepEqual(wasm,functional.wasm)
 const {sourceHash}=await import(pathToFileURL(root+'/scripts/wasm-source.mjs').href);assert.equal(sourceHash(),wasm.sourceSha256)
 assert.equal(hash(readFileSync(base+'/released-dist/qr.wasm')),'8b75949e2dbf5bf968718a8b776c9a8bb8ad8a5f894c6118686ec95efa8258ad')
 assert.equal(json(root+'/package.json').version,'0.3.14')
 const integrated=json(base+'/integration-files.json');for(const [p,h]of Object.entries(integrated))assert.equal(hash(readFileSync(root+'/'+p)),h,p)
 const binding={version:'0.3.14',wasm,typescript:candidate,qualificationSha256:hash(readFileSync(base+'/qualification.json')),functionalSha256:hash(readFileSync(base+'/functional.json')),integrated,baselineWasmSha256:hash(readFileSync(base+'/released-dist/qr.wasm')),verifierSha256:hash(readFileSync(new URL(import.meta.url)))}
 if(freeze){assert(!existsSync(base+'/production-binding.json'));writeFileSync(base+'/production-binding.json',JSON.stringify(binding,null,2)+'\n',{flag:'wx'})}
 else assert.deepEqual(binding,json(base+'/production-binding.json'))
 return binding
}
if(process.argv[1]===new URL(import.meta.url).pathname){await verifyProduction(process.argv[2],process.argv[3],true);console.log('Production sources/compiled JS/WASM match frozen qualification and functional results')}
