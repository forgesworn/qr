import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {framesFor} from './frames-fresh.mjs'
const [root,rivals,out]=process.argv.slice(2), sha=x=>createHash('sha256').update(x).digest('hex')
const prior=[
 'benchmarks/2026-11-16-m4/mesh-boundary-continuation/fresh-manifest.json',
 'benchmarks/2026-11-16-m4/deferred-mesh-reading/new128-manifest.json',
 'benchmarks/2026-11-17-m4/starved-curvature-recovery/holdout-manifest.json',
 'benchmarks/2026-11-17-m4/conflicting-format-recovery/holdout-manifest.json',
 'benchmarks/2026-11-17-m4/ordinary-curvature-refinement/fresh-manifest.json',
].map(path=>({path,data:readFileSync(root+'/'+path)}))
const older=prior.flatMap(p=>JSON.parse(p.data).cases), frames=framesFor(rivals)
assert.equal(older.length,608)
assert.equal(frames.length,128)
assert.equal(new Set(frames.map(f=>f.meta.pixelSha256)).size,128)
assert.equal(new Set(frames.map(f=>f.meta.textSha256)).size,128)
for(const f of frames){
 assert(!older.some(p=>p.pixelSha256===f.meta.pixelSha256),'Previously evaluated pixels')
 assert(!older.some(p=>p.textSha256===f.meta.textSha256),'Previously evaluated payload')
}
writeFileSync(out,JSON.stringify({baseline:'d6a411ca26f01f9a2b32e7a3e7bcccbbdefc7a63',encoder:'qrcode@1.5.4',generatorSha256:sha(readFileSync(new URL('./frames-fresh.mjs',import.meta.url))),frozenAt:new Date().toISOString(),frozenBeforeDecoderEvaluation:true,disjointEarlierCases:older.length,priorManifests:prior.map(p=>({path:p.path,sha256:sha(p.data)})),cases:frames.map(f=>f.meta)},null,2)+'\n',{flag:'wx'})
console.log('Frozen128 inputs, disjoint from608 earlier cases; no decoder imported or evaluated')
