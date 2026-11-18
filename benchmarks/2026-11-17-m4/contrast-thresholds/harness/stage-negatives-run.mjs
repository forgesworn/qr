// One shard of the stage-targeted frames decoded by each build. Records
// whether step 23 would run (a pixel changes side) and each status.
// node stage-negatives-run.mjs <rivals> <shard> <shards> <out.jsonl> <name=dist>...
import { writeFileSync, appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { stageFrames } from './stage-negatives.mjs'
const [rivals, shardArg, shardsArg, out, ...specs] = process.argv.slice(2)
const shard = Number(shardArg), shards = Number(shardsArg)
const variants = []
for (const spec of specs) {
  const [name, dist] = spec.split('=')
  variants.push({ name, decode: (await import(pathToFileURL(resolve(dist) + '/decode.js'))).decodeCounted, dist: resolve(dist) })
}
const B = await import(pathToFileURL(variants.at(-1).dist + '/binarise.js'))
const qrcode = createRequire(resolve(rivals) + '/package.json')('qrcode')
const encode = (text, ecc) => { const q = qrcode.create(text, { errorCorrectionLevel: ecc }); return { size: q.modules.size, modules: q.modules.data } }
writeFileSync(out, '')
const frames = stageFrames(encode)
for (let i = shard; i < frames.length; i += shards) {
  const f = frames[i]
  const lum = { data: f.data, width: f.width, height: f.height }
  const reaches = B.contrastThresholds(lum, B.levelBlocks(lum)) !== undefined
  const row = { name: f.name, kind: f.kind, reaches, v: {} }
  for (const { name, decode } of variants) {
    const r = decode(lum)
    row.v[name] = f.text === null ? (r ? 'FALSE-READ' : 'clean') : !r ? 'miss' : r.text === f.text ? 'correct' : 'WRONG'
  }
  appendFileSync(out, JSON.stringify(row) + '\n')
}
