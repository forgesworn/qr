// Every regression corpus, enumerated deterministically. Diagnostic only.
// Yields { suite, name, image, text }: text is a string for a positive, null
// for a negative and undefined when no oracle text is recorded.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const hash = b => createHash('sha256').update(b).digest('hex')
const load = p => import(pathToFileURL(p).href)

export const SUITES = ['photos184', 'photoTransforms2944', 'stress256', 'qualified160', 'validation192', 'synthetic96',
  'lowres224', 'curved1120', 'curvedNew256', 'conformance94', 'negatives12', 'spreadDev120']

export async function* corpus(root, rivals, only) {
  process.env.QR_RIVALS = rivals
  const want = name => !only || only.includes(name)
  const { readPng } = await load(`${root}/test/png.ts`)
  const ext = createRequire(`${rivals}/package.json`)
  assert.equal(ext('qrcode/package.json').version, '1.5.4')
  const qr = ext('qrcode')
  const encode = (text, ecc) => { const q = qr.create(text, { errorCorrectionLevel: ecc }); return { size: q.modules.size, modules: q.modules.data } }

  const photos = JSON.parse(readFileSync(`${root}/vectors/photos.json`, 'utf8')).photos
  assert.equal(photos.length, 184)
  const photo = p => {
    const raw = readFileSync(`${root}/vectors/photos-cache/raw/${p.id}.txt`)
    assert.equal(hash(raw), p.textSha256)
    const image = readPng(new Uint8Array(readFileSync(`${root}/vectors/photos-cache/grey/${p.id}.png`)))
    assert.equal(hash(image.data), p.pixelsSha256)
    return { image, text: new TextDecoder('utf8', { fatal: true }).decode(raw) }
  }
  if (want('photos184')) for (const p of photos) { const { image, text } = photo(p); yield { suite: 'photos184', name: p.id, image, text } }
  if (want('photoTransforms2944')) {
    for (const p of photos) {
      const { image: original, text } = photo(p)
      for (const mirrored of [false, true]) {
        let frame = { ...original, data: original.data.slice() }
        if (mirrored) {
          const before = frame.data.slice()
          for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) frame.data[y * frame.width + x] = before[y * frame.width + frame.width - 1 - x]
        }
        for (let rotation = 0; rotation < 4; rotation++) {
          for (const inverted of [false, true]) {
            const image = inverted ? { ...frame, data: Uint8Array.from(frame.data, x => 255 - x) } : frame
            yield { suite: 'photoTransforms2944', name: `${p.id}/r${rotation}/${mirrored ? 'm' : 'n'}/${inverted ? 'i' : 'n'}`, image, text }
          }
          const { width, height, data } = frame, rotated = new Uint8Array(data.length)
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rotated[x * height + height - 1 - y] = data[y * width + x]
          frame = { data: rotated, width: height, height: width }
        }
      }
    }
  }
  for (const [suite, path, total] of [['stress256', 'fresh-stress-unevaluated', 256], ['qualified160', 'overflow-recovery/fresh160', 160]]) {
    if (!want(suite)) continue
    const dir = `${root}/benchmarks/2026-11-16-m4/${path}`
    const { makeCase } = await load(`${dir}/generate.mjs`)
    const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'))
    for (let i = 0; i < total; i++) {
      const c = total === 256 ? (i < 224 ? makeCase(Math.floor(i / 28), i % 28) : makeCase(8, i - 224)) : makeCase(i)
      assert.deepEqual(c.meta, manifest.cases[i])
      yield { suite, name: c.meta.id, image: c.image, text: c.meta.expectedText }
    }
  }
  const { validationFrames, heldOutFrames } = await load(`${root}/scripts/comparison-fixtures.mjs`)
  for (const [suite, make] of [['validation192', () => validationFrames(encode)], ['synthetic96', () => heldOutFrames(encode)]]) {
    if (!want(suite)) continue
    for (const f of make()) yield { suite, name: f.name, image: { data: f.data, width: f.width, height: f.height }, text: f.expected }
  }
  if (want('lowres224')) {
    const dir = `${root}/benchmarks/2026-11-17-m4/low-resolution-recovery`
    const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'))
    const { makeCase } = await load(`${dir}/generate.mjs`)
    for (let i = 0; i < manifest.cases.length; i++) {
      const c = makeCase(i)
      assert.deepEqual(c.meta, manifest.cases[i])
      yield { suite: 'lowres224', name: c.meta.id, image: c.image, text: c.meta.expectedText }
    }
  }
  if (want('curved1120')) {
    const { corpora } = await load(`${root}/benchmarks/2026-11-17-m4/quadratic-mesh-recovery/corpora.mjs`)
    for (const [name, generator, manifestPath] of corpora) {
      const frames = (await load(`${root}/benchmarks/2026-11-17-m4/selected-mesh-recovery/${generator}`)).framesFor(rivals)
      assert.deepEqual(frames.map(f => f.meta), JSON.parse(readFileSync(`${root}/${manifestPath}`, 'utf8')).cases)
      for (const f of frames) yield { suite: 'curved1120', name: `${name}/${f.meta.id}`, image: f.image, text: f.text }
    }
  }
  if (want('curvedNew256')) {
    const frames = (await load(`${root}/benchmarks/2026-11-17-m4/quadratic-mesh-recovery/validation-frames.mjs`)).framesFor(rivals)
    assert.deepEqual(frames.map(f => f.meta), JSON.parse(readFileSync(`${root}/benchmarks/2026-11-17-m4/quadratic-mesh-recovery/validation-manifest.json`, 'utf8')).cases)
    for (const f of frames) yield { suite: 'curvedNew256', name: f.meta.id, image: f.image, text: f.text }
  }
  if (want('conformance94')) {
    for (const f of JSON.parse(readFileSync(`${root}/vectors/conformance.json`, 'utf8')).frames) {
      const image = readPng(new Uint8Array(readFileSync(`${root}/vectors/${f.file}`)))
      yield { suite: 'conformance94', name: f.file, image, text: f.result ? f.result.text : null }
    }
  }
  if (only && only.includes('spreadDev120')) {
    const { framesFor } = await load(new URL('./erosion/dev.mjs', import.meta.url).pathname)
    for (const f of framesFor(rivals)) yield { suite: 'spreadDev120', name: f.meta.id, image: f.image, text: f.text }
  }
  if (only && only.includes('step9Dev120')) {
    const { framesFor } = await load(new URL('./erosion/step9.mjs', import.meta.url).pathname)
    for (const f of framesFor(rivals)) yield { suite: 'step9Dev120', name: f.meta.id, image: f.image, text: f.text }
  }
  if (want('negatives12')) {
    for (const [width, height] of [[512, 512], [1280, 720], [1920, 1080]]) {
      for (const seed of [0x49ad7e32, 0x0fe13bc9]) {
        let state = seed
        const data = Uint8Array.from({ length: width * height }, () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state >>> 24 })
        yield { suite: 'negatives12', name: `noise-${width}x${height}-${seed.toString(16)}`, image: { data, width, height }, text: null }
      }
    }
    for (const level of [0, 127, 255]) yield { suite: 'negatives12', name: `blank-${level}`, image: { data: new Uint8Array(1280 * 720).fill(level), width: 1280, height: 720 }, text: null }
    for (const pattern of ['stripes', 'checkerboard', 'gradient']) {
      const width = 1280, height = 720, data = new Uint8Array(width * height)
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        data[y * width + x] = pattern === 'gradient' ? Math.round(255 * (x + y) / (width + height - 2))
          : pattern === 'stripes' ? (Math.floor(x / 3) % 2 ? 230 : 25)
          : (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 230 : 25
      }
      yield { suite: 'negatives12', name: pattern, image: { data, width, height }, text: null }
    }
  }
}
