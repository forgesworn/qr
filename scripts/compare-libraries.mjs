// Node >=24; rivals must be installed in a separate, disposable directory.
// npm install --prefix /tmp/qr-rivals --ignore-scripts --no-audit --no-fund --save-exact zxing-wasm@3.1.7 qrcode@1.5.4
// node scripts/compare-libraries.mjs /tmp/qr-rivals > results.json
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import jsQR from 'jsqr'
import * as ts from '../dist/index.js'
import { loadWasm, wasmUrl } from '../dist/wasm.js'
import { readPng } from '../test/png.ts'
import { heldOutFrames, timingFrames, rgba, summary } from './comparison-fixtures.mjs'
const rivals = resolve(process.argv[2] ?? '/tmp/qr-rivals')
const external = createRequire(pathToFileURL(rivals + '/package.json'))
const zxing = await import(pathToFileURL(external.resolve('zxing-wasm/reader')))
const qrcode = external('qrcode')
assert.equal(external('qrcode/package.json').version, '1.5.4')
const zxingVersion = JSON.parse(readFileSync(rivals + '/node_modules/zxing-wasm/package.json')).version
assert.equal(zxingVersion, '3.1.7')
const zxingBytes = readFileSync(external.resolve('zxing-wasm/reader/zxing_reader.wasm'))
const start = performance.now()
const wasm = await loadWasm(readFileSync(new URL(wasmUrl)))
const ownStartupMs = performance.now() - start
const zxStart = performance.now()
await zxing.prepareZXingModule({ overrides: { wasmBinary: zxingBytes }, fireImmediately: true })
const zxingStartupMs = performance.now() - zxStart
const zxOptions = { formats: ['QRCode'], maxNumberOfSymbols: 1, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, textMode: 'Plain' }
const readers = {
  typescript: frame => ts.decode(frame), wasm: frame => wasm.decode(frame),
  jsqr: frame => jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' }),
  zxing: frame => zxing.readBarcodes(frame, zxOptions),
}
const text = (name, result) => name === 'jsqr' ? result?.data : name === 'zxing' ? result[0]?.text : result?.text
const bytes = (name, result) => name === 'jsqr' ? result?.binaryData : name === 'zxing' ? result[0]?.bytes : result?.bytes
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const identity = createHash('sha256')
for (const file of readdirSync('dist').filter(f => f.endsWith('.js')).sort()) identity.update(file).update(readFileSync('dist/' + file))
const result = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  javascriptSha256: identity.digest('hex'), wasmSha256: hash(readFileSync(new URL(wasmUrl))),
  node: process.version, cpu: cpus()[0]?.model, loadBefore: loadavg(),
  versions: { jsqr: '1.4.0', qrcode: '1.5.4', zxing: zxingVersion },
  zxingWasmSha256: hash(zxingBytes), externalLockSha256: hash(readFileSync(rivals + '/package-lock.json')),
  options: zxOptions, rounds: 25, warmup: 5, startupMs: { wasm: ownStartupMs, zxing: zxingStartupMs }, decode: [], encode: [], accuracy: {},
}
try {
  for (const frame of timingFrames(ts.encode)) {
    const samples = Object.fromEntries(Object.keys(readers).map(n => [n, []]))
    for (let round = -5; round < 25; round++) {
      const names = Object.keys(readers); const offset = (round + 5) % names.length
      for (const name of [...names.slice(offset), ...names.slice(0, offset)]) {
        const t = performance.now(), value = await readers[name](frame), elapsed = performance.now() - t
        assert.equal(text(name, value), frame.expected, frame.name + '/' + name)
        if (frame.expected) assert.deepEqual(Array.from(bytes(name, value)), Array.from(new TextEncoder().encode(frame.expected)))
        if (round >= 0) samples[name].push(elapsed)
      }
    }
    result.decode.push({ name: frame.name, rgbaSha256: hash(frame.data), ...Object.fromEntries(Object.entries(samples).map(([n, v]) => [n, summary(v)])) })
  }
  for (const [name, data, options] of [
    ['url', 'https://example.com/performance/0123456789', {}],
    ['mixed', 'lightning:LNBC' + '0123456789ACDEFGHJKLMNPQRSTUVWXYZ'.repeat(8), {}],
    ['numeric', '0123456789'.repeat(100), {}],
    ['bytes-v40', new Uint8Array(1200).fill(97), { version: 40 }],
  ]) {
    const implementations = { typescript: () => ts.encode(data, options), wasm: () => wasm.encode(data, options), qrcode: () => qrcode.create(typeof data === 'string' ? data : [{ data: Buffer.from(data), mode: 'byte' }], { version: options.version, errorCorrectionLevel: 'M' }) }
    const samples = Object.fromEntries(Object.keys(implementations).map(n => [n, []]))
    const shapes = {}
    for (const [n, run] of Object.entries(implementations)) {
      const qr = run(), modules = n === 'qrcode' ? qr.modules.data : qr.modules, size = n === 'qrcode' ? qr.modules.size : qr.size
      assert.deepEqual(Array.from(ts.decodeModules(modules, size).bytes), Array.from(typeof data === 'string' ? new TextEncoder().encode(data) : data))
      shapes[n] = { version: qr.version, size, mask: qr.mask ?? qr.maskPattern }
    }
    for (let round = -5; round < 25; round++) {
      const names = Object.keys(implementations), offset = (round + 5) % names.length
      for (const n of [...names.slice(offset), ...names.slice(0, offset)]) {
        const t = performance.now(); for (let i = 0; i < 10; i++) implementations[n]()
        if (round >= 0) samples[n].push((performance.now() - t) / 10)
      }
    }
    result.encode.push({ name, shapes, ...Object.fromEntries(Object.entries(samples).map(([n, v]) => [n, summary(v)])) })
  }
  const manifest = JSON.parse(readFileSync('vectors/photos.json'))
  const photos = manifest.photos.map(p => {
    const expected = readFileSync(`vectors/photos-cache/raw/${p.id}.txt`)
    assert.equal(hash(expected), p.textSha256)
    const png = readFileSync(`vectors/photos-cache/grey/${p.id}.png`)
    const grey = readPng(png)
    if (p.pixelsSha256) assert.equal(hash(grey.data), p.pixelsSha256)
    return { name: p.id, expected: new TextDecoder('utf-8', { fatal: true }).decode(expected), ...rgba(grey) }
  })
  const generated = heldOutFrames((text, ecc) => { const qr = qrcode.create(text, { errorCorrectionLevel: ecc }); return { size: qr.modules.size, modules: qr.modules.data } })
  for (const [name, frames] of [['existing-photos', photos], ['held-out-synthetic', generated]]) {
    const digest = createHash('sha256'); for (const frame of frames) digest.update(frame.name).update(frame.data)
    const scores = Object.fromEntries(Object.keys(readers).map(n => [n, { correct: 0, missed: [], wrong: [], totalMs: 0 }]))
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i], names = Object.keys(readers), offset = i % names.length
      for (const n of [...names.slice(offset), ...names.slice(0, offset)]) {
        const t = performance.now(), value = await readers[n](frame), elapsed = performance.now() - t, got = text(n, value)
        scores[n].totalMs += elapsed
        if (got === frame.expected) scores[n].correct++
        else if (got === undefined) scores[n].missed.push(frame.name)
        else scores[n].wrong.push(frame.name)
      }
    }
    result.accuracy[name] = { count: frames.length, rgbaSha256: digest.digest('hex'), scores }
  }
  result.memoryBytes = wasm.memoryBytes; result.loadAfter = loadavg()
  console.log(JSON.stringify(result, null, 2))
  assert.equal(result.accuracy['held-out-synthetic'].scores.typescript.wrong.length, 0)
  assert.equal(result.accuracy['held-out-synthetic'].scores.wasm.wrong.length, 0)
} finally { wasm.dispose() }
