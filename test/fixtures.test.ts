// Shared decode fixtures: fixed synthetic frames saved as PNG with their
// expected text, so ports in other languages are tested on the same pixels.
// QR_WRITE_FIXTURES=1 regenerates vectors/decode-frames/ and its manifest.
// Every payload is made up.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import jsQRModule from 'jsqr'
import { describe, expect, it } from 'vitest'
import { decode, encode, type ErrorCorrection } from '../src/index.js'
import { photograph, prng, type Shot, toRgba } from './photo.js'
import { readPng, writePng } from './png.js'

const jsQR = jsQRModule as unknown as typeof jsQRModule.default

const DIR = new URL('../vectors/decode-frames/', import.meta.url)
const MANIFEST = new URL('../vectors/decode-frames.json', import.meta.url)

interface Frame {
  file: string
  text: string
  ecc: ErrorCorrection
  version: number
  shot: Shot
  /** This decoder read it when the fixtures were made. */
  typescript: boolean
  /** jsQR read it when the fixtures were made. */
  jsqr: boolean
}

function payloads(random: () => number): string[] {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('')
  const pick = (alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')
  const b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  return [
    `https://example.com/r/${hex(12)}?k=${pick(b64, 22)}`,
    `bunker://${hex(64)}?relay=wss%3A%2F%2Frelay.example.com&secret=${hex(16)}`,
    `nostrconnect://${hex(64)}?relay=wss%3A%2F%2Frelay.example.com&secret=${hex(8)}&name=Example`,
    `LIGHTNING:LNBC${pick('0123456789ACDEFGHJKLMNPQRSTUVWXYZ', 180 + Math.floor(random() * 100))}`,
    pick('0123456789', 48),
    `https://example.com/r/${hex(12)}?k=${pick(b64, 22)}&h=${pick(b64, 60 + Math.floor(random() * 120))}`,
  ]
}

function generate(): Frame[] {
  const random = prng(2026)
  const levels: ErrorCorrection[] = ['L', 'M', 'Q', 'H']
  const frames: Frame[] = []
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(DIR, { recursive: true })
  for (let i = 0; i < 36; i++) {
    const clean = i < 6
    const shot: Shot = clean
      ? { scale: 3 + Math.round(random() * 3), seed: i + 1 }
      : {
          scale: Math.round((2.5 + random() * 3.5) * 100) / 100,
          angle: Math.round(random() * 3600) / 10,
          perspective: Math.round(random() * 30) / 100,
          noise: random() < 0.5 ? Math.round(random() * 40) : 0,
          blur: random() < 0.3 ? 1 : 0,
          shade: random() < 0.4 ? Math.round((0.35 + random() * 0.4) * 100) / 100 : undefined,
          invert: random() < 0.15,
          mirror: random() < 0.1,
          seed: i + 1,
        }
    const all = payloads(random)
    const text = all[i % all.length]!
    const ecc = levels[Math.floor(random() * 4)]!
    const qr = encode(text, { ecc })
    const image = photograph(qr.modules, qr.size, shot)
    const file = `frame-${String(i + 1).padStart(2, '0')}.png`
    writeFileSync(new URL(file, DIR), writePng(image))
    frames.push({
      file,
      text,
      ecc,
      version: qr.version,
      shot,
      typescript: decode(image)?.text === text,
      jsqr: jsQR(toRgba(image), image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data === text,
    })
  }
  const note =
    'Synthetic frames for decoder ports. Each PNG is 8-bit greyscale; text is the exact payload. ' +
    '"typescript" and "jsqr" record which decoders read it when the frames were made. All payloads are made up.'
  writeFileSync(MANIFEST, `${JSON.stringify({ note, frames }, null, 1)}\n`)
  return frames
}

describe('decode fixtures', () => {
  const frames: Frame[] = process.env.QR_WRITE_FIXTURES
    ? generate()
    : (JSON.parse(readFileSync(MANIFEST, 'utf8')) as { frames: Frame[] }).frames

  it('PNG files round-trip', () => {
    const random = prng(5)
    const image = { data: new Uint8Array(37 * 11).map(() => Math.floor(random() * 256)), width: 37, height: 11 }
    expect(readPng(writePng(image))).toEqual(image)
  })

  it('still reads every frame it read when the fixtures were made', () => {
    expect(frames.length).toBeGreaterThan(30)
    for (const f of frames) {
      if (!f.typescript) continue
      const image = readPng(new Uint8Array(readFileSync(new URL(f.file, DIR))))
      expect(decode(image)?.text, f.file).toBe(f.text)
    }
    const ours = frames.filter((f) => f.typescript).length
    const theirs = frames.filter((f) => f.jsqr).length
    expect(ours).toBeGreaterThanOrEqual(theirs)
  }, 60_000)
})
