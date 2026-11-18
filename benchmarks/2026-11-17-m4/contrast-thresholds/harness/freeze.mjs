// Generates the fresh frames with the pinned independent encoder and writes
// their manifest. Run once, before any decoder evaluation.
// node freeze.mjs <rivals> <out.json> [generator.mjs] [positives] [negatives]
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const [rivals, out, generator = 'fresh.mjs', positivesArg = '480', negativesArg = '96'] = process.argv.slice(2)
const { freshFrames, SEED } = await import(new URL(`./${generator}`, import.meta.url))
const counts = { positives: Number(positivesArg), negatives: Number(negativesArg) }
const ext = createRequire(rivals + '/package.json')
assert.equal(ext('qrcode/package.json').version, '1.5.4')
const qrcode = ext('qrcode')
const encode = (text, ecc) => { const q = qrcode.create(text, { errorCorrectionLevel: ecc }); return { size: q.modules.size, modules: q.modules.data } }
const hash = b => createHash('sha256').update(b).digest('hex')
const frames = freshFrames(encode, counts)
const all = createHash('sha256')
const rows = frames.map(f => {
  const h = hash(f.data)
  all.update(f.name).update(h).update(String(f.text))
  return { name: f.name, width: f.width, height: f.height, pixelsSha256: h, text: f.text, version: f.version, ecc: f.ecc, contrast: +f.frame.contrast.toFixed(1), blur: f.frame.blur, inverted: f.frame.inverted, scale: f.place ? +f.place.scale.toFixed(2) : undefined }
})
const manifest = { seed: SEED, generator, generatorSha256: hash(readFileSync(new URL(`./${generator}`, import.meta.url))), encoder: 'qrcode 1.5.4', positives: rows.filter(r => r.text).length, negatives: rows.filter(r => !r.text).length, framesSha256: all.digest('hex'), frames: rows }
writeFileSync(out, JSON.stringify(manifest, null, 1))
console.log(JSON.stringify({ positives: manifest.positives, negatives: manifest.negatives, generatorSha256: manifest.generatorSha256, framesSha256: manifest.framesSha256 }))
