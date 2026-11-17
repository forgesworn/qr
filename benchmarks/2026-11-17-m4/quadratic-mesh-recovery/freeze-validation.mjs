import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {framesFor} from './validation-frames.mjs'
import {corpora} from './corpora.mjs'
import {verifyPrototype} from './verify-prototype.mjs'
const [root,base]=process.argv.slice(2),sha=x=>createHash('sha256').update(x).digest('hex'),json=p=>JSON.parse(readFileSync(p))
assert(!existsSync(base+'/validation-manifest.json'));assert(!existsSync(base+'/qualification.json'))
const identity=verifyPrototype(root,base),declaration=json(base+'/validation-declaration.json')
assert.equal(declaration.generatorSha256,sha(readFileSync(base+'/validation-frames.mjs')))
const earlier=corpora.flatMap(([,g,m])=>json(root+'/'+m).cases);assert.equal(earlier.length,1120)
const pixels=new Set(earlier.map(c=>c.pixelSha256)),texts=new Set(earlier.map(c=>c.textSha256)),frames=framesFor(base+'/rivals')
assert.equal(frames.length,256)
for(const f of frames){assert.equal(sha(f.image.data),f.meta.pixelSha256);assert.equal(sha(f.text),f.meta.textSha256);assert(!pixels.has(f.meta.pixelSha256),'Repeated pixels');assert(!texts.has(f.meta.textSha256),'Repeated payload');pixels.add(f.meta.pixelSha256);texts.add(f.meta.textSha256)}
const manifest={baseline:'b1d95074fb442d87004be1c8bd22b8d8e5c8646f',frozenAt:new Date().toISOString(),frozenBeforeValidationEvaluation:true,priorEvaluation:'Known16 causal screen only; none of these256 generated frames has been decoded',identity,generatorSha256:declaration.generatorSha256,declarationSha256:sha(readFileSync(base+'/validation-declaration.json')),freezeHelperSha256:sha(readFileSync(new URL(import.meta.url))),priorManifests:corpora.map(([,g,m])=>({path:m,sha256:sha(readFileSync(root+'/'+m))})),disjointEarlierCases:1120,cases:frames.map(f=>f.meta)}
writeFileSync(base+'/validation-manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log('Frozen256 mutually unique frames and payloads, disjoint from all1120 earlier curves, with candidate source/build identity')
