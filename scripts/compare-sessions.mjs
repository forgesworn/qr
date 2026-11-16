// Offline moving-frame sequences, not a physical camera or phone benchmark.
// Rivals live outside the project: node scripts/compare-sessions.mjs /tmp/qr-rivals
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import * as ts from '../dist/index.js'
import { loadWasm, wasmUrl } from '../dist/wasm.js'
import { summary, rgba } from './comparison-fixtures.mjs'

const rivals = resolve(process.argv[2] ?? '/tmp/qr-rivals')
const external = createRequire(pathToFileURL(rivals + '/package.json'))
const zxing = await import(pathToFileURL(external.resolve('zxing-wasm/reader')))
const qrcode = external('qrcode')
assert.equal(external('qrcode/package.json').version, '1.5.4')
assert.equal(JSON.parse(readFileSync(rivals + '/node_modules/zxing-wasm/package.json')).version, '3.1.7')
const zxingBytes = readFileSync(external.resolve('zxing-wasm/reader/zxing_reader.wasm'))
await zxing.prepareZXingModule({ overrides: { wasmBinary: zxingBytes }, fireImmediately: true })
const wasmBytes = readFileSync(new URL(wasmUrl))
const wasm = await loadWasm(wasmBytes)
const tracked = wasm.createDecoder(), typescript = ts.createDecoder()
const options = { formats: ['QRCode'], maxNumberOfSymbols: 1, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, textMode: 'Plain' }
const readers = {
  typescript: f => ts.decode(f), typescriptSession: f => typescript.decode(f),
  wasm: f => wasm.decode(f), wasmSession: f => tracked.decode(f),
  zxing: async f => (await zxing.readBarcodes(f, options))[0],
}
const frames = [
  ['acquire', 250, 160, 'one'], ['track-1', 254, 162, 'one'], ['track-2', 260, 168, 'one'],
  ['changed-payload', 260, 168, 'two'], ['track-3', 270, 174, 'two'],
  ['jump', 950, 470, 'three'], ['track-after-jump', 940, 465, 'three'],
  ['blank', 0, 0, undefined], ['reacquire', 100, 100, 'four'], ['track-4', 104, 105, 'four'],
].map(([name, left, top, payload]) => {
  const width = 1280, height = 720, data = new Uint8Array(width * height).fill(235)
  const expected = payload ? 'https://example.com/camera/' + payload : undefined
  if (expected) {
    const qr = qrcode.create(expected, { errorCorrectionLevel: 'M' }), scale = 6
    for (let y = 0; y < qr.modules.size; y++) for (let x = 0; x < qr.modules.size; x++) {
      if (qr.modules.data[y * qr.modules.size + x]) for (let dy = 0; dy < scale; dy++) {
        data.fill(20, (top + y * scale + dy) * width + left + x * scale, (top + y * scale + dy) * width + left + (x + 1) * scale)
      }
    }
  }
  return { name, expected, ...rgba({ data, width, height }) }
})
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const identity = createHash('sha256')
for (const file of readdirSync('dist').filter(f => f.endsWith('.js')).sort()) identity.update(file).update(readFileSync('dist/' + file))
const results = frames.map(frame => ({ name: frame.name, rgbaSha256: hash(frame.data), samples: Object.fromEntries(Object.keys(readers).map(name => [name, []])) }))
const totals = Object.fromEntries(Object.keys(readers).map(name => [name, []]))
const loadBefore = loadavg()
try {
  for (let round = -5; round < 30; round++) {
    typescript.reset(); tracked.reset()
    const sum = Object.fromEntries(Object.keys(readers).map(name => [name, 0]))
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i], names = Object.keys(readers), offset = (round + 5 + i) % names.length
      for (const name of [...names.slice(offset), ...names.slice(0, offset)]) {
        const start = performance.now(), result = await readers[name](frame), elapsed = performance.now() - start
        assert.equal(result?.text, frame.expected, frame.name + '/' + name)
        if (frame.expected) assert.deepEqual(Array.from(result.bytes), Array.from(new TextEncoder().encode(frame.expected)))
        if (round >= 0) results[i].samples[name].push(elapsed)
        sum[name] += elapsed
      }
    }
    if (round >= 0) for (const name of Object.keys(readers)) totals[name].push(sum[name])
  }
  console.log(JSON.stringify({
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    javascriptSha256: identity.digest('hex'), wasmSha256: hash(wasmBytes), zxingWasmSha256: hash(zxingBytes),
    node: process.version, arch: process.arch, cpu: cpus()[0]?.model, loadBefore, loadAfter: loadavg(),
    rounds: 30, warmup: 5, options, versions: { zxing: '3.1.7', qrcode: '1.5.4' },
    sequence: results.map(({ samples, ...rest }) => ({ ...rest, ...Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { ...summary(values), samplesMs: values }])) })),
    total: Object.fromEntries(Object.entries(totals).map(([name, values]) => [name, { ...summary(values), samplesMs: values }])),
    memoryBytes: wasm.memoryBytes,
  }, null, 2))
} finally { wasm.dispose() }
