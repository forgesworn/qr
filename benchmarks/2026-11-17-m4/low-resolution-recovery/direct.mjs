import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cpus, loadavg, platform } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.argv.length, 5, 'usage: node direct.mjs <root> <rivals> <output>')
const root = resolve(process.argv[2]), rivals = resolve(process.argv[3]), output = resolve(process.argv[4])
const model = cpus()[0]?.model ?? 'unknown'
assert(model.includes('M4'), 'Direct acceptance timings must run on the M4')
assert.equal(process.arch, 'arm64')
const hash = value => createHash('sha256').update(value).digest('hex')
const load = path => import(pathToFileURL(path))
const { encode } = await load(`${root}/dist/index.js`)
const { loadWasm } = await load(`${root}/dist/wasm.js`)
const { timingFrames, summary } = await load(`${root}/scripts/comparison-fixtures.mjs`)
const require = createRequire(`${rivals}/package.json`)
assert.equal(JSON.parse(readFileSync(`${rivals}/node_modules/zxing-wasm/package.json`)).version, '3.1.7')
const binary = readFileSync(`${root}/dist/qr.wasm`), rivalBinary = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'))
assert.equal(hash(binary), JSON.parse(readFileSync(`${root}/wasm/manifest.json`, 'utf8')).sha256)
assert.equal(hash(rivalBinary), '33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59')
const wasm = await loadWasm(binary), zx = await load(require.resolve('zxing-wasm/reader'))
await zx.prepareZXingModule({ overrides: { wasmBinary: rivalBinary }, fireImmediately: true })
const options = { formats: ['QRCode'], maxNumberOfSymbols: 1, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, textMode: 'Plain' }
const readers = { qr: frame => wasm.decode(frame), zxing: async frame => (await zx.readBarcodes(frame, options))[0] }
const identity = Object.fromEntries(readdirSync(`${root}/dist`).filter(n => n.endsWith('.js')).sort().map(n => [n, hash(readFileSync(`${root}/dist/${n}`))]))
const result = { node: process.version, arch: process.arch, platform: platform(), cpu: model, loadBefore: loadavg(), versions: { qr: JSON.parse(readFileSync(`${root}/package.json`)).version, zxing: '3.1.7' }, wasmSha256: hash(binary), zxingWasmSha256: hash(rivalBinary), candidateGenerated: identity, runnerSha256: hash(readFileSync(new URL(import.meta.url))), fixtureSourceSha256: hash(readFileSync(`${root}/scripts/comparison-fixtures.mjs`)), options, warmupMinimumPairs: 10, warmupMinimumMs: 500, measuredPairs: 60, cases: [] }
result.linearCapacityBytesBefore = wasm.memoryBytes
try {
  for (const frame of timingFrames(encode)) {
    const references = {}, samples = { qr: [], zxing: [] }, before = hash(frame.data)
    for (const [name, reader] of Object.entries(readers)) {
      const value = await reader(frame)
      assert.equal(value?.text, frame.expected, `${frame.name}/${name}`)
      if (value) assert.deepEqual(Array.from(value.bytes), Array.from(new TextEncoder().encode(frame.expected)))
      references[name] = value
      assert.equal(hash(frame.data), before)
    }
    const pair = async (round, measured) => {
      for (const name of round % 2 ? ['qr', 'zxing'] : ['zxing', 'qr']) {
        const start = performance.now(), value = await readers[name](frame), elapsed = performance.now() - start
        assert.deepEqual(value, references[name])
        assert.equal(hash(frame.data), before)
        if (measured) samples[name].push(elapsed)
      }
    }
    let rounds = 0
    const started = performance.now()
    while (rounds < 10 || performance.now() - started < 500) await pair(rounds++, false)
    for (let round = 0; round < 60; round++) await pair(round, true)
    result.cases.push({ name: frame.name, width: frame.width, height: frame.height, rgbaSha256: before, warmupPairs: rounds, ...Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { ...summary(values), samplesMs: values }])) })
  }
  result.linearCapacityBytesAfter = wasm.memoryBytes
  result.loadAfter = loadavg()
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
} finally {
  wasm.dispose()
}
