import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {framesFor} from './frames-next-fresh.mjs'
assert.equal(process.argv.length, 5, 'usage: node freeze-next.mjs <repo-root> <rivals-root> <new-output>')
const [root,rivals,out]=process.argv.slice(2).map(path=>resolve(path))
const sha=x=>createHash('sha256').update(x).digest('hex')
const baseline='8360eb3b648ebc1d9439684a9f643cc1fb162713'
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseline,'Unexpected repository revision')
const prior=[
 'benchmarks/2026-11-16-m4/mesh-boundary-continuation/fresh-manifest.json',
 'benchmarks/2026-11-16-m4/deferred-mesh-reading/new128-manifest.json',
 'benchmarks/2026-11-17-m4/starved-curvature-recovery/holdout-manifest.json',
 'benchmarks/2026-11-17-m4/conflicting-format-recovery/holdout-manifest.json',
 'benchmarks/2026-11-17-m4/ordinary-curvature-refinement/fresh-manifest.json',
 'benchmarks/2026-11-17-m4/version-peer-recovery/fresh-manifest.json',
].map(path=>({path,data:readFileSync(root+'/'+path)}))
const older=prior.flatMap(p=>JSON.parse(p.data).cases), frames=framesFor(rivals)
assert.equal(older.length,736)
assert.equal(frames.length,128)
assert.equal(new Set(frames.map(f=>f.meta.pixelSha256)).size,128)
assert.equal(new Set(frames.map(f=>f.meta.textSha256)).size,128)
for(const f of frames){
 assert(!older.some(p=>p.pixelSha256===f.meta.pixelSha256),'Previously evaluated pixels')
 assert(!older.some(p=>p.textSha256===f.meta.textSha256),'Previously evaluated payload')
}
writeFileSync(out,JSON.stringify({baseline,freezeSha256:sha(readFileSync(new URL(import.meta.url))),encoder:'qrcode@1.5.4',declarations:{seed:'0x59d14e27',payloadPrefix:'ALTERNATE-GRID-HOLDOUT-',versions:[7,15,23,40],scales:[2,3],amplitudes:[3,6],signs:[-1,1],axes:['x','y'],profiles:['parabola','double-wave']},generatorSha256:sha(readFileSync(new URL('./frames-next-fresh.mjs',import.meta.url))),frozenAt:new Date().toISOString(),frozenBeforeDecoderEvaluation:true,disjointEarlierCases:older.length,priorManifests:prior.map(p=>({path:p.path,sha256:sha(p.data)})),cases:frames.map(f=>f.meta)},null,2)+'\n',{flag:'wx'})
console.log('Frozen128 inputs, disjoint from736 earlier cases; no decoder imported or evaluated')
