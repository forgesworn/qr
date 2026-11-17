// One shard of the corpus decoded by every variant. Diagnostic only.
// node runner.mjs <root> <rivals> <shard> <shards> <out.jsonl> <name=dist>... [--only suite,suite]
import { createHash } from 'node:crypto'
import { writeFileSync, appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { corpus } from './corpus.mjs'
const argv = process.argv.slice(2)
const onlyAt = argv.indexOf('--only')
const only = onlyAt >= 0 ? argv.splice(onlyAt, 2)[1].split(',') : undefined
const [root, rivals, shardArg, shardsArg, out, ...specs] = argv
const shard = Number(shardArg), shards = Number(shardsArg)
const variants = []
for (const spec of specs) {
  const [name, dist] = spec.split('=')
  variants.push({ name, decode: (await import(pathToFileURL(resolve(dist) + '/decode.js'))).decodeCounted })
}
const canon = r => r === undefined ? null : JSON.stringify(r, (k, v) => v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v)
const short = s => s === null ? null : createHash('sha256').update(s).digest('hex').slice(0, 16)
const status = (text, r) => text === undefined ? (r ? 'read' : 'none') : text === null ? (r ? 'negativeFalse' : 'negativeClean') : !r ? 'miss' : r.text === text ? 'correct' : 'wrong'
writeFileSync(out, '')
let index = -1
for await (const item of corpus(resolve(root), resolve(rivals), only)) {
  index++
  if (index % shards !== shard) continue
  const row = { i: index, suite: item.suite, name: item.name, w: item.image.width, h: item.image.height, v: {} }
  let baseCanon
  for (const [k, { name, decode }] of variants.entries()) {
    const work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    const t = performance.now()
    const r = decode(item.image, {}, work)
    const ms = performance.now() - t
    const c = canon(r)
    if (k === 0) baseCanon = c
    row.v[name] = { s: status(item.text, r), h: short(c), ms: +ms.toFixed(3), work, ...(k > 0 && c !== baseCanon ? { result: c } : {}) }
  }
  if (Object.values(row.v).some(v => v.result !== undefined)) row.v[variants[0].name].result = baseCanon
  appendFileSync(out, JSON.stringify(row) + '\n')
}
