// Pin both builds before running. No QR libraries are installed in this project.
// node scripts/compare-negative.mjs /path/to/baseline/dist /tmp/qr-rivals
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as ts from '../dist/index.js'
import { loadWasm, wasmUrl } from '../dist/wasm.js'
import { rgba, summary } from './comparison-fixtures.mjs'

assert(process.argv[2] && process.argv[3], 'Supply baseline dist and external rival directory')
const baseline = resolve(process.argv[2]), rivals = resolve(process.argv[3])
const oldTs = await import(pathToFileURL(baseline + '/index.js'))
const oldWasmLoader = await import(pathToFileURL(baseline + '/wasm.js'))
const oldWasmBytes = readFileSync(baseline + '/qr.wasm'), newWasmBytes = readFileSync(new URL(wasmUrl))
const oldWasm = await oldWasmLoader.loadWasm(oldWasmBytes), wasm = await loadWasm(newWasmBytes)
const external = createRequire(pathToFileURL(rivals + '/package.json'))
assert.equal(JSON.parse(readFileSync(rivals + '/node_modules/zxing-wasm/package.json')).version, '3.1.7')
const zxing = await import(pathToFileURL(external.resolve('zxing-wasm/reader')))
const zxingBytes = readFileSync(external.resolve('zxing-wasm/reader/zxing_reader.wasm'))
await zxing.prepareZXingModule({ overrides: { wasmBinary: zxingBytes }, fireImmediately: true })
const options = { formats: ['QRCode'], maxNumberOfSymbols: 1, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, textMode: 'Plain' }
const readers = {
  baselineTypescript: f => oldTs.decode(f), typescript: f => ts.decode(f),
  baselineWasm: f => oldWasm.decode(f), wasm: f => wasm.decode(f),
  zxing: async f => (await zxing.readBarcodes(f, options))[0],
}
const cases = []
for (const [width, height] of [[512, 512], [1280, 720], [1920, 1080]]) {
  for (const seed of [0x49ad7e32, 0x0fe13bc9]) {
    let state = seed
    const data = Uint8Array.from({ length: width * height }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state >>> 24
    })
    cases.push({ name: `noise-${width}x${height}-${seed.toString(16)}`, ...rgba({ data, width, height }) })
  }
}
for (const level of [0, 127, 255]) cases.push({ name: `blank-${level}`, ...rgba({ data: new Uint8Array(1280 * 720).fill(level), width: 1280, height: 720 }) })
for (const pattern of ['stripes', 'checkerboard', 'gradient']) {
  const width = 1280, height = 720, data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    data[y * width + x] = pattern === 'gradient' ? Math.round(255 * (x + y) / (width + height - 2))
      : pattern === 'stripes' ? (Math.floor(x / 3) % 2 ? 230 : 25)
      : (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 230 : 25
  }
  cases.push({ name: pattern, ...rgba({ data, width, height }) })
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function jsHash(directory) {
  const value = createHash('sha256')
  for (const file of readdirSync(directory).filter(f => f.endsWith('.js')).sort()) value.update(file).update(readFileSync(directory + '/' + file))
  return value.digest('hex')
}
const loadBefore = loadavg(), rows = []
try {
  for (const frame of cases) {
    const samples = Object.fromEntries(Object.keys(readers).map(name => [name, []]))
    for (let round = -5; round < 30; round++) {
      const names = Object.keys(readers), offset = (round + 5) % names.length
      for (const name of [...names.slice(offset), ...names.slice(0, offset)]) {
        const start = performance.now(), found = await readers[name](frame), elapsed = performance.now() - start
        assert.equal(found, undefined, `${frame.name}/${name} returned a symbol in a negative fixture`)
        if (round >= 0) samples[name].push(elapsed)
      }
    }
    rows.push({ name: frame.name, width: frame.width, height: frame.height, rgbaSha256: hash(frame.data), ...Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { ...summary(values), samplesMs: values }])) })
  }
  console.log(JSON.stringify({
    baselineJavascriptSha256: jsHash(baseline), javascriptSha256: jsHash(resolve('dist')),
    baselineWasmSha256: hash(oldWasmBytes), wasmSha256: hash(newWasmBytes), zxingWasmSha256: hash(zxingBytes),
    node: process.version, arch: process.arch, cpu: cpus()[0]?.model, loadBefore, loadAfter: loadavg(),
    rounds: 30, warmup: 5, options, zxingVersion: '3.1.7', rows,
  }, null, 2))
} finally { oldWasm.dispose(); wasm.dispose() }
