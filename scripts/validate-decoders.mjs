// Fresh seed fixed before the decoder freeze. Rival packages stay outside this repository.
// node scripts/validate-decoders.mjs /path/to/baseline/dist /tmp/qr-rivals
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cpus, loadavg } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import * as current from '../dist/index.js'
import { loadWasm, wasmUrl } from '../dist/wasm.js'
import { validationFrames } from './comparison-fixtures.mjs'

const baselinePath = resolve(process.argv[2])
const rivals = resolve(process.argv[3])
const external = createRequire(pathToFileURL(rivals + '/package.json'))
const baseline = await import(pathToFileURL(baselinePath + '/index.js'))
const oldAdapter = await import(pathToFileURL(baselinePath + '/wasm.js'))
const qrcode = external('qrcode')
const zxing = await import(pathToFileURL(external.resolve('zxing-wasm/reader')))
assert.equal(external('qrcode/package.json').version, '1.5.4')
assert.equal(JSON.parse(readFileSync(rivals + '/node_modules/zxing-wasm/package.json')).version, '3.1.7')
const oldBytes = readFileSync(baselinePath + '/qr.wasm')
const newBytes = readFileSync(new URL(wasmUrl))
const zxBytes = readFileSync(external.resolve('zxing-wasm/reader/zxing_reader.wasm'))
const oldWasm = await oldAdapter.loadWasm(oldBytes)
const wasm = await loadWasm(newBytes)
await zxing.prepareZXingModule({ overrides: { wasmBinary: zxBytes }, fireImmediately: true })
const options = { formats: ['QRCode'], maxNumberOfSymbols: 1, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, textMode: 'Plain' }
const readers = {
  baselineTypescript: frame => baseline.decode(frame), baselineWasm: frame => oldWasm.decode(frame),
  typescript: frame => current.decode(frame), wasm: frame => wasm.decode(frame),
  zxing: async frame => (await zxing.readBarcodes(frame, options))[0],
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const jsHash = dir => {
  const digest = createHash('sha256')
  for (const file of readdirSync(dir).filter(f => f.endsWith('.js')).sort()) digest.update(file).update(readFileSync(dir + '/' + file))
  return digest.digest('hex')
}
const frames = validationFrames((text, ecc) => {
  const qr = qrcode.create(text, { errorCorrectionLevel: ecc })
  return { size: qr.modules.size, modules: qr.modules.data }
})
const digest = createHash('sha256')
for (const frame of frames) digest.update(frame.name).update(frame.data)
const result = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  cpu: cpus()[0]?.model, arch: process.arch, node: process.version, loadBefore: loadavg(),
  versions: { qrcode: '1.5.4', zxing: '3.1.7' }, options,
  javascriptSha256: jsHash('dist'), baselineJavascriptSha256: jsHash(baselinePath),
  wasmSha256: hash(newBytes), baselineWasmSha256: hash(oldBytes), zxingWasmSha256: hash(zxBytes),
  externalLockSha256: hash(readFileSync(rivals + '/package-lock.json')),
  seed: '0x6d3a217b', count: frames.length, rgbaSha256: digest.digest('hex'),
  scores: Object.fromEntries(Object.keys(readers).map(name => [name, { correct: 0, missed: [], wrong: [], totalMs: 0 }])),
  regressions: { typescript: [], wasm: [] }, outcomes: [],
}
try {
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i], names = Object.keys(readers), offset = i % names.length
    const expectedBytes = new TextEncoder().encode(frame.expected), outcomes = {}
    for (const name of [...names.slice(offset), ...names.slice(0, offset)]) {
      const start = performance.now(), value = await readers[name](frame)
      const score = result.scores[name]
      score.totalMs += performance.now() - start
      const correct = value?.text === frame.expected && value?.bytes?.length === expectedBytes.length && expectedBytes.every((byte, j) => value.bytes[j] === byte)
      outcomes[name] = correct ? 'correct' : value === undefined ? 'missed' : 'wrong'
      if (correct) score.correct++
      else score[outcomes[name]].push(frame.name)
    }
    for (const [name, old] of [['typescript', 'baselineTypescript'], ['wasm', 'baselineWasm']]) {
      if (outcomes[old] === 'correct' && outcomes[name] !== 'correct') result.regressions[name].push(frame.name)
    }
    result.outcomes.push({ name: frame.name, ...outcomes })
  }
  result.loadAfter = loadavg()
  console.log(JSON.stringify(result, null, 2))
  assert.equal(result.scores.typescript.wrong.length, 0)
  assert.equal(result.scores.wasm.wrong.length, 0)
  assert.deepEqual(result.regressions, { typescript: [], wasm: [] })
} finally { oldWasm.dispose(); wasm.dispose() }
