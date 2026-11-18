// Decodes the frozen fresh frames with each build and pinned ZXing-WASM.
// node fresh-run.mjs <rivals> <manifest.json> <out.json> <name=dist>...
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const [rivals, manifestPath, out, ...specs] = process.argv.slice(2)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const hash = b => createHash('sha256').update(b).digest('hex')
const generator = manifest.generator ?? 'fresh.mjs'
assert.equal(hash(readFileSync(new URL(`./${generator}`, import.meta.url))), manifest.generatorSha256, 'generator changed since freezing')
const { freshFrames } = await import(new URL(`./${generator}`, import.meta.url))
const ext = createRequire(resolve(rivals) + '/package.json')
assert.equal(ext('qrcode/package.json').version, '1.5.4')
const qrcode = ext('qrcode')
const encode = (text, ecc) => { const q = qrcode.create(text, { errorCorrectionLevel: ecc }); return { size: q.modules.size, modules: q.modules.data } }
const frames = freshFrames(encode, { positives: manifest.positives, negatives: manifest.negatives })
const all = createHash('sha256')
for (const f of frames) all.update(f.name).update(hash(f.data)).update(String(f.text))
assert.equal(all.digest('hex'), manifest.framesSha256, 'frames differ from the frozen manifest')
const zxBytes = readFileSync(ext.resolve('zxing-wasm/reader/zxing_reader.wasm'))
assert.equal(hash(zxBytes), '33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59')
const zx = await import(pathToFileURL(ext.resolve('zxing-wasm/reader')).href)
await zx.prepareZXingModule({ overrides: { wasmBinary: zxBytes }, fireImmediately: true })
const zxOptions = { formats: ['QRCode'], maxNumberOfSymbols: 1, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, textMode: 'Plain' }
const variants = []
for (const spec of specs) {
  const [name, dist] = spec.split('=')
  variants.push({ name, decode: (await import(pathToFileURL(resolve(dist) + '/decode.js'))).decodeCounted })
}
const status = (text, r) => text === null ? (r ? 'negativeFalse' : 'negativeClean') : !r ? 'miss' : r.text === text ? 'correct' : 'wrong'
const rows = []
for (const f of frames) {
  const row = { name: f.name, positive: f.text !== null, contrast: f.frame.contrast, blur: f.frame.blur, inverted: f.frame.inverted, scale: f.place?.scale, v: {} }
  for (const { name, decode } of variants) {
    const work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    const t = performance.now()
    const r = decode({ data: f.data, width: f.width, height: f.height }, {}, work)
    row.v[name] = { s: status(f.text, r), ms: +(performance.now() - t).toFixed(2), work }
  }
  const rgba = new Uint8ClampedArray(f.width * f.height * 4)
  for (let i = 0; i < f.data.length; i++) { rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = f.data[i]; rgba[4 * i + 3] = 255 }
  const z = (await zx.readBarcodes({ data: rgba, width: f.width, height: f.height }, zxOptions))[0]
  row.v.zxing = { s: status(f.text, z && z.isValid !== false ? z : undefined) }
  rows.push(row)
}
const names = [...variants.map(v => v.name), 'zxing']
const tally = filter => Object.fromEntries(names.map(n => {
  const t = { correct: 0, miss: 0, wrong: 0, negativeClean: 0, negativeFalse: 0 }
  for (const r of rows.filter(filter)) t[r.v[n].s]++
  return [n, t]
}))
const summary = {
  framesSha256: manifest.framesSha256,
  positives: manifest.positives,
  negatives: manifest.negatives,
  all: tally(() => true),
  byContrast: Object.fromEntries([[35, 60], [60, 85], [85, 110], [110, 141]].map(([a, b]) => [`${a}-${b}`, tally(r => r.positive && r.contrast >= a && r.contrast < b)])),
  byScale: Object.fromEntries([[1.8, 2.4], [2.4, 3], [3, 4.1]].map(([a, b]) => [`${a}-${b}`, tally(r => r.positive && r.scale >= a && r.scale < b)])),
  byBlur: Object.fromEntries([0, 1, 2].map(b => [b, tally(r => r.positive && r.blur === b)])),
  inverted: tally(r => r.positive && r.inverted),
  changes: rows.flatMap(r => names.slice(1).filter(n => n !== 'zxing' && r.v[n].s !== r.v[names[0]].s).map(n => ({ name: r.name, variant: n, from: r.v[names[0]].s, to: r.v[n].s }))),
  zxingOnlyAgainstLast: rows.filter(r => r.v.zxing.s === 'correct' && r.v[variants.at(-1).name].s !== 'correct').map(r => r.name),
}
writeFileSync(out, JSON.stringify({ summary, rows }, null, 1))
console.log(JSON.stringify(summary, null, 1))
