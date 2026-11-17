// Records, for each corpus image, the returning stage, the reading map and the triples tried. Diagnostic only.
// node run-trace2.mjs <root> <rivals> <shard> <shards> <out.jsonl> <traced-dist>
import { writeFileSync, appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { corpus } from './corpus.mjs'
const [root, rivals, shardArg, shardsArg, out, dist] = process.argv.slice(2)
const shard = Number(shardArg), shards = Number(shardsArg)
const { decodeCounted } = await import(pathToFileURL(resolve(dist) + '/decode.js'))
let current
const finder = p => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), m: +p.moduleSize.toFixed(2), c: p.count })
globalThis.__t = {
  stage(name) { current.stage = name },
  map(f, inv, tol, rank, triple, delta, location, ok, strict, hints, inverseFallback) {
    const key = `${f}|${inv ? 1 : 0}|${tol}|${rank}|${inverseFallback ? 1 : 0}`
    let t = current.triples.get(key)
    if (!t) { t = { f, inv, tol, rank, fallback: inverseFallback, counts: triple.map(p => p.count), modules: triple.map(p => +p.moduleSize.toFixed(2)), maps: {} }; current.triples.set(key, t) }
    t.maps[delta] = (t.maps[delta] ?? 0) + 1
    if (ok) current.hit = { f, inv, tol, rank, delta, fallback: inverseFallback, size: location.size, alignment: location.alignment !== undefined, triple: triple.map(finder) }
  },
}
writeFileSync(out, '')
let index = -1
for await (const item of corpus(resolve(root), resolve(rivals))) {
  index++
  if (index % shards !== shard) continue
  current = { stage: undefined, hit: undefined, triples: new Map() }
  const r = decodeCounted(item.image, {})
  const status = item.text === undefined ? (r ? 'read' : 'none') : item.text === null ? (r ? 'negativeFalse' : 'negativeClean') : !r ? 'miss' : r.text === item.text ? 'correct' : 'wrong'
  appendFileSync(out, JSON.stringify({ i: index, suite: item.suite, name: item.name, status, stage: r ? current.stage : null, hit: r && ['full', 'reduced', 'inverse-full', 'inverse-reduced'].includes(current.stage) ? current.hit : null, triples: [...current.triples.values()] }) + '\n')
}
