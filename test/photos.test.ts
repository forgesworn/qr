// Real photographs with known contents. The images are not committed: run
// `npm run fetch-photos` to download them into vectors/photos-cache/ (hash-checked
// and converted to 8-bit greyscale). Without the cache this file skips.
//
// vectors/photos.json holds paths, hashes and the baseline; the expected text is
// read at run time from the hash-pinned .txt files in the cache. The test fails if
// any photo decodes to the wrong text, or if fewer photos are read than the
// recorded floor. QR_WRITE_PHOTOS=1 re-takes the baseline from the current decoder.
//
// Expected text is compared exactly as stored (UTF-8, no trimming, no newline
// normalisation): some expected texts end in a newline or hold CRLF on purpose.
// Failure messages name the photo and what the decoder returned, never the expected text.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import jsQRModule from 'jsqr'
import { describe, expect, it } from 'vitest'
import { createDecoder, decode } from '../src/index.js'
import { loadWasm } from '../src/wasm.js'
import { toRgba } from './photo.js'
import { readPng } from './png.js'

const jsQR = jsQRModule as unknown as typeof jsQRModule.default

const MANIFEST = new URL('../vectors/photos.json', import.meta.url)
const CACHE = new URL('../vectors/photos-cache/', import.meta.url)

interface Photo {
  id: string
  source: string
  set: string
  file: string
  sha256: string
  pixelsSha256?: string
  textSha256: string
  /** This decoder read it when the baseline was taken. */
  typescript: boolean
  /** The comparison library read it when the baseline was taken (information only). */
  jsqr: boolean
}

interface Manifest {
  note: string
  sources: unknown[]
  ratchet: { typescript: number }
  photos: Photo[]
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest
const greyUrl = (p: Photo) => new URL(`grey/${p.id}.png`, CACHE)
const textUrl = (p: Photo) => new URL(`raw/${p.id}.txt`, CACHE)
const cached = manifest.photos.every((p) => existsSync(greyUrl(p)) && existsSync(textUrl(p)))
if (process.env.QR_REQUIRE_PHOTOS === '1' && !cached) {
  throw new Error('photograph cache required: run npm run fetch-photos')
}
function expected(p: Photo): string {
  const bytes = readFileSync(textUrl(p))
  if (createHash('sha256').update(bytes).digest('hex') !== p.textSha256) throw new Error(`expected-text file for ${p.id} does not match its hash; run npm run fetch-photos`)
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
const load = (p: Photo) => readPng(new Uint8Array(readFileSync(greyUrl(p))))

function summary(photos: Photo[]): string {
  const rows = new Map<string, { n: number; ts: number; jsqr: number }>()
  for (const p of photos) {
    const key = `${p.source}/${p.set}`
    const r = rows.get(key) ?? { n: 0, ts: 0, jsqr: 0 }
    r.n++
    if (p.typescript) r.ts++
    if (p.jsqr) r.jsqr++
    rows.set(key, r)
  }
  return [...rows].map(([k, r]) => `${k}: ${r.ts}/${r.n} (comparison library ${r.jsqr})`).join('\n')
}

describe.skipIf(!cached)('photographs', () => {
  it('preserves every readable photo and complete text in the packaged WASM backend', async () => {
    const wasm = await loadWasm(readFileSync(new URL('../wasm/qr.wasm', import.meta.url)))
    try {
      let correct = 0
      for (const p of manifest.photos) {
        const image = load(p), actual = wasm.decode(image), reference = decode(image)
        expect(actual?.bytes, p.id).toEqual(reference?.bytes)
        expect(actual?.text, p.id).toBe(reference?.text)
        if (actual) { expect(actual.text, p.id).toBe(expected(p)); correct++ }
        if (p.typescript) expect(actual, p.id).toBeDefined()
      }
      expect(correct).toBeGreaterThanOrEqual(manifest.ratchet.typescript)
    } finally { wasm.dispose() }
  })

  if (process.env.QR_WRITE_PHOTOS) {
    it('re-takes the baseline', () => {
      const pixels = new Map<string, string>()
      const list = new URL('pixels.txt', CACHE)
      if (existsSync(list)) {
        for (const line of readFileSync(list, 'utf8').split('\n')) {
          const f = line.split(' ')
          if (f.length === 4) pixels.set(f[0]!, f[3]!)
        }
      }
      const wrong: string[] = []
      for (const p of manifest.photos) {
        const image = load(p)
        const want = expected(p)
        const text = decode(image)?.text
        if (text !== undefined && text !== want) wrong.push(`${p.id}: decoder returned ${JSON.stringify(text).slice(0, 80)}`)
        p.typescript = text === want
        p.jsqr = jsQR(toRgba(image), image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data === want
        const px = pixels.get(p.id)
        if (px) p.pixelsSha256 = px
      }
      console.log(summary(manifest.photos))
      if (wrong.length > 0) throw new Error(`wrong text, baseline not written:\n${wrong.join('\n')}`)
      manifest.ratchet.typescript = manifest.photos.filter((p) => p.typescript).length
      writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`)
      console.log(summary(manifest.photos))
    }, 1_800_000)
    return
  }

  const results = new Map<string, string | undefined>()
  const read = (p: Photo) => {
    if (!results.has(p.id)) results.set(p.id, decode(load(p))?.text)
    return results.get(p.id)
  }

  it('never returns the wrong text', () => {
    const wrong = manifest.photos.filter((p) => {
      const text = read(p)
      return text !== undefined && text !== expected(p)
    })
    expect(wrong.map((p) => p.id)).toEqual([])
  }, 1_800_000)

  it('reads at least as many photographs as the recorded baseline', () => {
    const readIds = manifest.photos.filter((p) => read(p) === expected(p)).map((p) => p.id)
    const lost = manifest.photos.filter((p) => p.typescript && !readIds.includes(p.id)).map((p) => p.id)
    console.log(`photographs read: ${readIds.length}/${manifest.photos.length} (floor ${manifest.ratchet.typescript}); baseline images no longer read: ${lost.join(' ') || 'none'}`)
    expect(lost, 'previously readable photographs must remain readable').toEqual([])
    expect(readIds.length).toBeGreaterThanOrEqual(manifest.ratchet.typescript)
  }, 1_800_000)

  it('preserves readable photographs without wrong text after a camera session learns their region', () => {
    for (const p of manifest.photos) {
      const reader = createDecoder()
      const image = load(p)
      const want = expected(p)
      const first = reader.decode(image)
      const tracked = reader.decode(image)
      if (tracked) expect(tracked.text, p.id).toBe(want)
      if (first) expect(tracked?.text, `lost after tracking: ${p.id}`).toBe(want)
      reader.reset()
    }
  }, 1_800_000)
})
