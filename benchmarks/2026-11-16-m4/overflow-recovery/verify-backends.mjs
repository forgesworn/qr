// Recheck the qualified outcomes against the final packaged TypeScript and WASM.
// node verify-backends.mjs <repo> <evaluation-build> <rivals> <new-receipt>
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const [rootArg, buildArg, rivalsArg, output] = process.argv.slice(2)
assert(rootArg && buildArg && rivalsArg && output)
const root = resolve(rootArg), build = resolve(buildArg), evidence = fileURLToPath(new URL('./', import.meta.url))
process.env.QR_RIVALS = resolve(rivalsArg)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = file => JSON.parse(readFileSync(file))
const load = file => import(pathToFileURL(file))
const external = createRequire(pathToFileURL(join(resolve(rivalsArg), 'package.json')))
assert.equal(external('qrcode/package.json').version, '1.5.4')
const qrcode = external('qrcode')
const encode = (text, ecc) => {
  const qr = qrcode.create(text, { errorCorrectionLevel: ecc })
  return { size: qr.modules.size, modules: qr.modules.data }
}
const { makeCase } = await load(join(build, 'fixture/generate.mjs'))
const { makeCase: freshCase } = await load(join(evidence, 'fresh160/generate.mjs'))
const { readPng } = await load(join(build, 'fixture/png.js'))
const { validationFrames, heldOutFrames, rgba } = await load(join(build, 'fixture/comparison-fixtures.mjs'))
const ts = await load(join(root, 'dist/index.js'))
const { loadWasm } = await load(join(root, 'dist/wasm.js'))
const binary = readFileSync(join(root, 'dist/qr.wasm')), wasm = await loadWasm(binary)
const frozenFresh = json(join(evidence, 'fresh160-results.json'))
assert.equal(frozenFresh.passed, true)
const references = { fresh160: sha(readFileSync(join(evidence, 'fresh160-results.json'))) }
const freshManifest = json(join(evidence, 'fresh160/manifest.json'))
const stressManifest = json(join(build, 'fixture/manifest.json'))
const publicResult = value => value && ({ ...value, location: Object.fromEntries(
  Object.entries(value.location).map(([key, p]) => [key, p && { x: p.x, y: p.y }])) })
const rows = []
try {
  for (const suite of ['photos', 'stress256', 'validation192', 'synthetic96', 'fresh160']) {
    const prior = suite === 'fresh160' ? frozenFresh : json(join(evidence, 'regression-results', suite + '.json'))
    assert.equal(prior.passed, true)
    if (suite !== 'fresh160') references[suite] = sha(readFileSync(join(evidence, 'regression-results', suite + '.json')))
    const reference = suite === 'fresh160' ? prior.outcomes : prior.rows
    const count = { photos: 184, stress256: 256, validation192: 192, synthetic96: 96, fresh160: 160 }[suite]
    assert.equal(prior.count, count)
    assert.equal(reference.length, count)
    assert.equal(new Set(reference.map(r => r.name ?? r.id)).size, count)
    let synthetic
    if (suite === 'validation192') synthetic = validationFrames(encode)
    if (suite === 'synthetic96') synthetic = heldOutFrames(encode)
    for (let i = 0; i < reference.length; i++) {
      const previous = reference[i], name = previous.name ?? previous.id
      let image
      if (suite === 'photos') image = readPng(readFileSync(join(root, 'vectors/photos-cache/grey', name + '.png')))
      else if (suite === 'stress256') {
        const c = i < 224 ? makeCase(Math.floor(i / 28), i % 28) : makeCase(8, i - 224)
        assert.deepEqual(c.meta, stressManifest.cases[i]); image = c.image
      } else if (suite === 'fresh160') {
        const c = freshCase(i)
        assert.deepEqual(c.meta, freshManifest.cases[i]); image = c.image
      } else image = synthetic[i]
      assert.equal(sha(image.data), previous.inputSha256 ?? previous.greySha256, name + ' original pixels')
      const frame = image.data.length === image.width * image.height * 4 ? image : rgba(image)
      const pixels = sha(frame.data)
      assert.equal(pixels, previous.rgbaSha256, name + ' RGBA pixels')
      const a = ts.decode(frame)
      assert.equal(sha(frame.data), pixels, name + ' TypeScript input preserved')
      const b = wasm.decode(frame)
      assert.deepEqual(publicResult(a), publicResult(b), name + ' complete TS/WASM result')
      assert.equal(sha(frame.data), pixels, name + ' input preserved')
      const textSha256 = a ? sha(Buffer.from(a.text)) : null, bytesSha256 = a ? sha(a.bytes) : null
      if (suite === 'fresh160') {
        assert.equal(a?.text ?? null, previous.candidate.text, name + ' qualified text')
        assert.equal(a ? Buffer.from(a.bytes).toString('hex') : null, previous.candidate.bytesHex, name + ' qualified bytes')
      } else {
        assert.equal(textSha256, previous.readers.candidate.textSha256, name + ' qualified text')
        assert.equal(bytesSha256, previous.readers.candidate.bytesSha256, name + ' qualified bytes')
      }
      rows.push({ suite, name, rgbaSha256: pixels, read: !!a, textSha256, bytesSha256 })
    }
  }
  const digest = createHash('sha256')
  assert.equal(rows.length, 888)
  for (const file of readdirSync(join(root, 'dist')).filter(f => f.endsWith('.js')).sort()) digest.update(file).update(readFileSync(join(root, 'dist', file)))
  writeFileSync(output, JSON.stringify({ passed: true, count: rows.length, javascriptSha256: digest.digest('hex'),
    wasmSha256: sha(binary), wasmBytes: binary.length, harnessSha256: sha(readFileSync(new URL(import.meta.url))),
    qualificationSha256: references, buildIdentitySha256: sha(readFileSync(join(build, 'identity.json'))), rows }, null, 2) + '\n', { flag: 'wx' })
  console.log(`Matched ${rows.length} qualified outcomes, complete TypeScript/WASM results and pixels`)
} finally { wasm.dispose() }
