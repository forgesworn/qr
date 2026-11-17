import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cpus, platform } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

if (process.argv.length < 6 || process.argv.length > 7) throw Error('usage: node compare.mjs <root> <baseline-dist> <rivals> <output> [--fresh]')
const [rootArg, baselineArg, rivalsArg, outputArg, freshFlag] = process.argv.slice(2)
const root = resolve(rootArg), baselinePath = resolve(baselineArg), rivals = resolve(rivalsArg), output = resolve(outputArg)
const fresh = freshFlag === '--fresh'
if (freshFlag !== undefined && !fresh) throw Error('unknown flag')
const model = cpus()[0]?.model ?? 'unknown'
if (fresh && !model.includes('M4')) throw Error('The fresh accuracy qualification must run on the M4')
const hash = value => createHash('sha256').update(value).digest('hex')
const load = path => import(pathToFileURL(path))
const baseline = await load(`${baselinePath}/decode.js`)
const candidate = await load(`${root}/dist/decode.js`)
const { loadWasm } = await load(`${root}/dist/wasm.js`)
const candidateWasm = await loadWasm(readFileSync(`${root}/dist/qr.wasm`))
const publicResult = value => value && ({ ...value, location: Object.fromEntries(Object.entries(value.location).map(([key, point]) => [key, point && { x: point.x, y: point.y }])) })
let parityCases = 0
const released = JSON.parse(readFileSync(`${root}/benchmarks/2026-11-17-m4/quadratic-mesh-recovery/qualification.json`, 'utf8'))
for (const [source, expected] of Object.entries(released.identity.generated)) {
  assert.equal(hash(readFileSync(`${baselinePath}/${source.replace(/\.ts$/, '.js')}`)), expected, `baseline ${source}`)
}
const identity = directory => Object.fromEntries(readdirSync(directory).filter(name => name.endsWith('.js')).sort().map(name => [name, hash(readFileSync(`${directory}/${name}`))]))
const require = createRequire(`${rivals}/package.json`)
assert.equal(require('qrcode/package.json').version, '1.5.4')
assert.equal(JSON.parse(readFileSync(`${rivals}/node_modules/zxing-wasm/package.json`)).version, '3.1.7')
const zx = await load(require.resolve('zxing-wasm/reader'))
const wasmBinary = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'))
assert.equal(hash(wasmBinary), '33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59')
await zx.prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true })
const options = { formats: ['QRCode'], maxNumberOfSymbols: 1, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, textMode: 'Plain' }
process.env.QR_RIVALS = rivals
const qr = require('qrcode')
const { rgba, validationFrames, heldOutFrames } = await load(`${root}/scripts/comparison-fixtures.mjs`)
const { readPng } = await load(`${root}/test/png.ts`)
const encode = (text, ecc) => { const q = qr.create(text, { errorCorrectionLevel: ecc }); return { size: q.modules.size, modules: q.modules.data } }
const counter = () => ({ steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 })
const failures = [], suites = []
async function evaluate(name, frames) {
  const scores = Object.fromEntries(['base', 'candidate', 'zxing'].map(reader => [reader, { correct: 0, miss: 0, wrong: 0, negativeClean: 0, negativeFalse: 0 }]))
  const rows = [], changed = [], byScale = {}
  for (const frame of frames) {
    const { image, text, bytes } = frame
    const sha = hash(image.data)
    const baseWork = counter(), candidateWork = counter()
    const values = { base: baseline.decodeCounted(image, {}, baseWork), candidate: candidate.decodeCounted(image, {}, candidateWork) }
    const colour = image.data.length === image.width * image.height * 4 ? image : rgba(image)
    const colourSha = hash(colour.data)
    values.zxing = (await zx.readBarcodes(colour, options))[0]
    try {
      assert.deepEqual(publicResult(candidateWasm.decode(image)), publicResult(values.candidate))
      parityCases++
      assert.equal(hash(image.data), sha)
      assert.equal(hash(colour.data), colourSha)
      assert.deepEqual(candidateWork, baseWork)
      assert(candidateWork.maps <= 720 && candidateWork.second <= 8 && candidateWork.probed <= 11_500_000)
      if (values.base) assert.deepEqual(values.candidate, values.base)
    } catch (error) {
      failures.push({ suite: name, name: frame.name, issue: error.message })
    }
    const row = { name: frame.name, pixelSha256: sha, readers: { base: { work: baseWork }, candidate: { work: candidateWork }, zxing: {} } }
    for (const [reader, value] of Object.entries(values)) {
      const valid = value && value.text === text && (reader === 'zxing' || bytes === undefined || Buffer.from(value.bytes).toString('hex') === bytes)
      const status = text === null ? (value ? 'negativeFalse' : 'negativeClean') : !value ? 'miss' : valid ? 'correct' : 'wrong'
      scores[reader][status]++
      row.readers[reader].status = status
      if (reader !== 'zxing' && (status === 'wrong' || status === 'negativeFalse')) failures.push({ suite: name, name: frame.name, reader, status })
    }
    if (row.readers.base.status !== row.readers.candidate.status) changed.push({ name: frame.name, scale: frame.scale ?? null, readers: Object.fromEntries(Object.entries(row.readers).map(([reader, value]) => [reader, value.status])) })
    if (frame.scale !== undefined) {
      const group = byScale[String(frame.scale)] ??= Object.fromEntries(['base', 'candidate', 'zxing'].map(reader => [reader, { correct: 0, total: 0 }]))
      for (const reader of Object.keys(group)) {
        group[reader].total++
        if (row.readers[reader].status === 'correct') group[reader].correct++
      }
    }
    rows.push(row)
  }
  const suite = { name, count: rows.length, scores, byScale, changed, rows }
  suites.push(suite)
  console.log(JSON.stringify({ suite: name, count: rows.length, scores, changed: changed.length, failures: failures.length }))
}
function* photos() {
  const manifest = JSON.parse(readFileSync(`${root}/vectors/photos.json`, 'utf8'))
  for (const p of manifest.photos) {
    const raw = readFileSync(`${root}/vectors/photos-cache/raw/${p.id}.txt`)
    assert.equal(hash(raw), p.textSha256)
    const image = readPng(new Uint8Array(readFileSync(`${root}/vectors/photos-cache/grey/${p.id}.png`)))
    assert.equal(hash(image.data), p.pixelsSha256)
    yield { name: p.id, image, text: new TextDecoder('utf8', { fatal: true }).decode(raw) }
  }
}
await evaluate('photos184', photos())
for (const [name, path, total] of [['stress256', 'fresh-stress-unevaluated', 256], ['previously-qualified160', 'overflow-recovery/fresh160', 160]]) {
  const dir = `${root}/benchmarks/2026-11-16-m4/${path}`
  const { makeCase } = await load(`${dir}/generate.mjs`)
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'))
  assert.equal(hash(readFileSync(require.resolve('qrcode'))), manifest.qrcodeMainSha256)
  function* frames() {
    for (let i = 0; i < total; i++) {
      const c = total === 256 ? (i < 224 ? makeCase(Math.floor(i / 28), i % 28) : makeCase(8, i - 224)) : makeCase(i)
      assert.deepEqual(c.meta, manifest.cases[i])
      assert.equal(hash(c.image.data), c.meta.greySha256)
      yield { name: c.meta.id, image: c.image, text: c.meta.expectedText, bytes: c.meta.expectedUtf8Hex, scale: c.meta.shot?.scale }
    }
  }
  await evaluate(name, frames())
}
for (const [name, frames] of [['validation192', validationFrames(encode)], ['synthetic96', heldOutFrames(encode)]]) {
  await evaluate(name, frames.map(image => ({ name: image.name, image, text: image.expected, bytes: Buffer.from(image.expected).toString('hex') })))
}
if (fresh) {
  const dir = `${root}/benchmarks/2026-11-17-m4/low-resolution-recovery`
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'))
  assert.equal(hash(readFileSync(`${dir}/generate.mjs`)), manifest.generatorSha256)
  assert.equal(hash(readFileSync(`${dir}/photo.mjs`)), manifest.photoSha256)
  assert.equal(hash(readFileSync(require.resolve('qrcode'))), manifest.qrcodeMainSha256)
  const { makeCase } = await load(`${dir}/generate.mjs`)
  function* frames() {
    for (let i = 0; i < manifest.cases.length; i++) {
      const c = makeCase(i)
      assert.deepEqual(c.meta, manifest.cases[i])
      assert.equal(hash(c.image.data), c.meta.greySha256)
      yield { name: c.meta.id, image: c.image, text: c.meta.expectedText, bytes: c.meta.expectedUtf8Hex, scale: c.meta.shot?.scale }
    }
  }
  await evaluate('low-resolution-validation224', frames())
}
candidateWasm.dispose()
writeFileSync(output, JSON.stringify({ passed: failures.length === 0, host: { model, platform: platform(), node: process.version }, baselineGenerated: identity(baselinePath), candidateGenerated: identity(`${root}/dist`), runnerSha256: hash(readFileSync(new URL(import.meta.url))), rivalLockSha256: hash(readFileSync(`${rivals}/package-lock.json`)), zxingWasmSha256: hash(wasmBinary), fresh, typescriptWasmPublicResultParityCases: parityCases, photoOracle: 'Exact expected text only; raw payload bytes are not independently supplied.', suites, failures }, null, 2) + '\n', { flag: 'wx' })
if (failures.length) process.exitCode = 1
