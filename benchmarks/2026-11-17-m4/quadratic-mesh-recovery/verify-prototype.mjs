import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
export function verifyPrototype(root,base){
 const sha=x=>createHash('sha256').update(x).digest('hex'),json=p=>JSON.parse(readFileSync(p)),git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'})
 assert.equal(git('rev-parse','HEAD').trim(),'b1d95074fb442d87004be1c8bd22b8d8e5c8646f')
 const receiptBytes=readFileSync(root+'/benchmarks/2026-11-17-m4/selected-mesh-recovery/production-qualified.json');assert.equal(sha(receiptBytes),'e3fd095acf869037599b642807ca03a7657c99080e35cb18abb634a9fa79891b')
 const receipt=JSON.parse(receiptBytes),identity=json(base+'/prototype-build/identity.json'),sources=json(base+'/prototype-sources.json')
 assert(identity.typechecked);assert.deepEqual(identity.sources,sources);assert.deepEqual(Object.keys(sources).sort(),Object.keys(receipt.identity.sources.public).sort())
 assert.equal(identity.builderSha256,sha(readFileSync(base+'/build-prototype.cjs')));assert.equal(identity.tsconfigSha256,sha(readFileSync(root+'/tsconfig.json')))
 for(const [dir,expected,ext]of [[root+'/src',receipt.identity.sources.public,'.ts'],[root+'/dist',receipt.identity.generated.public,'.js'],[base+'/prototype-source',sources,'.ts'],[base+'/prototype-build/public',identity.generated,'.js']]){
  assert.deepEqual(readdirSync(dir).filter(n=>n.endsWith(ext)).sort(),Object.keys(expected).map(n=>n.replace(/\.ts$/,ext)).sort())
  for(const [n,h]of Object.entries(expected))assert.equal(sha(readFileSync(dir+'/'+n.replace(/\.ts$/,ext))),h,dir+'/'+n)
 }
 return identity
}
