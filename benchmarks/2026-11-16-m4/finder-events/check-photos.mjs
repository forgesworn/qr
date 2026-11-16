// Compare complete public results without retaining photographs or decoded text.
// node check-photos.mjs <checkout> <generated-fixtures> <candidate.wasm>
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

assert(process.argv.length === 5, 'Supply checkout, generated fixtures and candidate WASM')
const root = resolve(process.argv[2]), generated = resolve(process.argv[3])
const { loadWasm } = await import(pathToFileURL(join(root, 'dist/wasm.js')))
const { readPng } = await import(pathToFileURL(join(generated, 'png.js')))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const manifestBytes = readFileSync(join(root, 'vectors/photos.json'))
const manifest = JSON.parse(manifestBytes)
const baselineBytes = readFileSync(join(root, 'wasm/qr.wasm'))
const candidateBytes = readFileSync(process.argv[4])
const before = await loadWasm(baselineBytes), after = await loadWasm(candidateBytes)
const javascript = createHash('sha256')
for (const name of readdirSync(join(root, 'dist')).filter(n => n.endsWith('.js')).sort()) {
  javascript.update(name).update(readFileSync(join(root, 'dist', name)))
}
const rows = []
let correct = 0
try {
  for (const photo of manifest.photos) {
    const expectedBytes = readFileSync(join(root, 'vectors/photos-cache/raw', photo.id + '.txt'))
    assert.equal(hash(expectedBytes), photo.textSha256, photo.id + ': expected-text hash')
    const expected = new TextDecoder('utf-8', { fatal: true }).decode(expectedBytes)
    const frame = readPng(readFileSync(join(root, 'vectors/photos-cache/grey', photo.id + '.png')))
    const pixelsSha256 = hash(frame.data)
    if (photo.pixelsSha256) assert.equal(pixelsSha256, photo.pixelsSha256, photo.id + ': pixel hash')
    const wanted = before.decode(frame), got = after.decode(frame)
    // Assert booleans so a failure cannot print a photo's decoded contents.
    assert.equal(isDeepStrictEqual(got, wanted), true, photo.id + ': complete result differs')
    assert.equal(hash(frame.data), pixelsSha256, photo.id + ': input mutated')
    if (got !== undefined) {
      assert.equal(got.text === expected, true, photo.id + ': incorrect text')
      correct++
    }
    if (photo.typescript) assert.equal(got !== undefined, true, photo.id + ': lost recorded read')
    rows.push({ id: photo.id, pixelsSha256, read: got !== undefined })
  }
  console.log(JSON.stringify({
    baselineWasmSha256: hash(baselineBytes), candidateWasmSha256: hash(candidateBytes),
    javascriptSha256: javascript.digest('hex'), manifestSha256: hash(manifestBytes),
    harnessSha256: hash(readFileSync(new URL(import.meta.url))),
    validation: 'Complete results, expected text and unchanged inputs; no timing',
    cases: rows.length, correct, lost: 0, wrong: 0, rows,
  }, null, 2))
} finally { before.dispose(); after.dispose() }
