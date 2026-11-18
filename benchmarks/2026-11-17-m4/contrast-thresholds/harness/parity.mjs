// Complete public results of the TypeScript and packaged WASM decoders, for
// one shard of the regression corpus and the frozen fresh frames.
// node parity.mjs <root> <rivals> <dist> <manifest.json[,manifest.json]> <shard> <shards> <out.jsonl>
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { corpus } from '../../noise-policy-screen/harness/corpus.mjs'
const [root, rivals, dist, manifestPath, shardArg, shardsArg, out] = process.argv.slice(2)
const shard = Number(shardArg), shards = Number(shardsArg)
const { decode } = await import(pathToFileURL(resolve(dist) + '/decode.js'))
const { loadWasm } = await import(pathToFileURL(resolve(dist) + '/wasm.js'))
const wasm = await loadWasm(readFileSync(resolve(dist) + '/qr.wasm'))
// Keys sorted at every level; locations reduced to x and y, as the TypeScript
// finders also carry their module size and sighting count.
const sorted = v => v instanceof Uint8Array ? Buffer.from(v).toString('hex')
  : Array.isArray(v) ? v.map(sorted)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v
const canon = r => r === undefined ? null : JSON.stringify(sorted({ ...r, location: Object.fromEntries(Object.entries(r.location).map(([k, p]) => [k, p && { x: p.x, y: p.y }])) }))
const hash = s => s === null ? null : createHash('sha256').update(s).digest('hex').slice(0, 16)
writeFileSync(out, '')
let index = -1
const check = (suite, name, image) => {
  index++
  if (index % shards !== shard) return
  const ts = canon(decode(image)), native = canon(wasm.decode(image))
  appendFileSync(out, JSON.stringify({ suite, name, read: ts !== null, same: ts === native, ts: hash(ts), wasm: hash(native) }) + '\n')
}
const SUITES = ['photos184', 'photoTransforms2944', 'stress256', 'qualified160', 'validation192', 'synthetic96', 'lowres224', 'curved1120', 'curvedNew256', 'conformance94', 'negatives12', 'spreadDev120', 'step9Dev120']
for await (const item of corpus(resolve(root), resolve(rivals), SUITES)) check(item.suite, item.name, item.image)
const qrcode = createRequire(resolve(rivals) + '/package.json')('qrcode')
const encode = (text, ecc) => { const q = qrcode.create(text, { errorCorrectionLevel: ecc }); return { size: q.modules.size, modules: q.modules.data } }
for (const path of manifestPath.split(',')) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  const { freshFrames } = await import(new URL(`./${manifest.generator ?? 'fresh.mjs'}`, import.meta.url))
  const frames = freshFrames(encode, { positives: manifest.positives, negatives: manifest.negatives })
  const all = createHash('sha256')
  for (const f of frames) all.update(f.name).update(createHash('sha256').update(f.data).digest('hex')).update(String(f.text))
  assert.equal(all.digest('hex'), manifest.framesSha256)
  for (const f of frames) check(`fresh${frames.length}-${manifest.seed}`, f.name, { data: f.data, width: f.width, height: f.height })
}
wasm.dispose()
