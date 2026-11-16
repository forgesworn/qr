// Three existing diagnostic fixtures; run only on the coordinated benchmark host.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { performance } from 'node:perf_hooks'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

if (process.argv.length !== 6) throw Error('Usage: node paired.mjs <repo-root> <diagnostic-generated-dir> <before.wasm> <after.wasm>')
const [root, generated, beforePath, afterPath] = process.argv.slice(2).map(p => resolve(p))
const load = p => import(pathToFileURL(p).href)
const { loadWasm } = await load(join(root, 'dist/wasm.js'))
const { encode } = await load(join(generated, 'base/encode.js'))
const { photograph, prng } = await load(join(generated, 'photo.js'))
const { readPng } = await load(join(generated, 'png.js'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sourceHash = createHash('sha256')
for (const n of readdirSync(join(generated, 'snapshot/src')).filter(n => n.endsWith('.ts')).sort()) sourceHash.update(n).update(readFileSync(join(generated, 'snapshot/src', n)))
const rev = 'bd23ee348e9f70fe8365c41ebcd3c54d165741f5'
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const pinnedSource = 'f0ab875c24cd74649a8e3635528f885e920567da8522649c05ed123f3da1ef01'
const sourceSha256 = sourceHash.digest('hex')
assert.equal(sourceSha256, pinnedSource, 'diagnostic source identity')
const binaries = { before: readFileSync(beforePath), after: readFileSync(afterPath) }
const modules = {}
const frames = [{
  name: 'bent-version-12',
  image: readPng(readFileSync(join(generated, 'snapshot/vectors/conformance/bent-version-12.png'))),
  expected: 'https://example.com/m/conformance0123456789abcdefghijklmnopqrs',
}]
const text = 'https://example.com/finder-damage/0123456789'
for (const seed of [11, 12]) {
  const qr = encode(text, { ecc: 'H' }), modules = qr.modules.slice(), random = prng(seed * 971 + 4), order = Array.from({ length: 49 }, (_, i) => i)
  for (let i = 0; i < 4; i++) {
    const j = i + Math.floor(random() * (49 - i)); [order[i], order[j]] = [order[j], order[i]]
    const x = order[i] % 7, y = Math.floor(order[i] / 7)
    for (const [ox, oy] of [[0, 0], [qr.size - 7, 0], [0, qr.size - 7]]) modules[(y + oy) * qr.size + x + ox] ^= 1
  }
  frames.push({ name: `finder-damage-4-${seed}-0`, image: photograph(modules, qr.size, { scale: 4, angle: 17, shade: 0.7 }), expected: text })
}
const output = {
  baselineRevision: rev, checkoutHead: head, sourceSha256, node: process.version, arch: process.arch,
  platform: process.platform, cpu: cpus()[0]?.model, cpuCount: cpus().length, loadBefore: loadavg(),
  wasmSha256: Object.fromEntries(Object.entries(binaries).map(([name, bytes]) => [name, hash(bytes)])),
  wasmBytes: Object.fromEntries(Object.entries(binaries).map(([name, bytes]) => [name, bytes.length])),
  harnessSha256: hash(readFileSync(new URL(import.meta.url))), adapterSha256: hash(readFileSync(join(root, 'dist/wasm.js'))),
  helpers: Object.fromEntries(['photo.js', 'png.js', 'base/encode.js', 'snapshot/test/photo.ts', 'snapshot/test/png.ts'].map(f => [f, hash(readFileSync(join(generated, f)))])),
  warmupMinPairs: 20, warmupMinMs: 1000, measuredPairs: 60, validation: 'Full results and input hashes outside timed decode calls', rows: [],
}
try {
  for (const name of ['before', 'after']) modules[name] = await loadWasm(binaries[name])
  for (const { name, image, expected } of frames) {
    const frameHash = hash(image.data)
    const reference = modules.before.decode(image)
    assert.equal(reference?.text, expected, name)
    assert.deepEqual(reference.bytes, new TextEncoder().encode(expected), name)
    assert.equal(hash(image.data), frameHash, name + ' input changed')
    const samples = { before: [], after: [] }
    function pair(n, measured) {
      for (const which of n % 2 === 0 ? ['before', 'after'] : ['after', 'before']) {
        const start = performance.now(); const actual = modules[which].decode(image); const elapsed = performance.now() - start
        assert.deepEqual(actual, reference, `${name}/${which} full result`)
        assert.equal(hash(image.data), frameHash, `${name}/${which} input changed`)
        if (measured) samples[which].push(elapsed)
      }
    }
    let warmups = 0; const warmStart = performance.now()
    while (warmups < 20 || performance.now() - warmStart < 1000) pair(warmups++, false)
    for (let round = 0; round < 60; round++) pair(round, true)
    output.rows.push({ name, width: image.width, height: image.height, frameSha256: frameHash, warmupPairs: warmups, samplesMs: samples })
  }
  output.loadAfter = loadavg()
  console.log(JSON.stringify(output, null, 2))
} finally { for (const module of Object.values(modules)) module.dispose() }
