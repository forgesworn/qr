// Decoder tests on synthetic photographs: codes drawn through a perspective
// map with rotation, small modules, blur, noise, uneven light, inversion and
// mirroring. jsQR reads the same frames, and is the bar: we must read at
// least as many as it does. jsQR is a development-only oracle.
import { readFileSync, writeFileSync } from 'node:fs'
import jsQRModule from 'jsqr'
import { describe, expect, it } from 'vitest'
import { decode, decodeModules, encode, type ErrorCorrection, type QrCode } from '../src/index.js'
import { type Grey, photograph, prng, type Shot, toRgba } from './photo.js'

const jsQR = jsQRModule as unknown as typeof jsQRModule.default

interface Vector { id: string; text: string; ecc: ErrorCorrection; version: number; mask: number; size: number; rows: string[] }
const { vectors } = JSON.parse(
  readFileSync(new URL('../vectors/encode-vectors.json', import.meta.url), 'utf8'),
) as { vectors: Vector[] }

function fromRows(rows: string[], size: number): Uint8Array {
  const m = new Uint8Array(size * size)
  rows.forEach((row, y) => {
    for (let x = 0; x < size; x++) m[y * size + x] = (parseInt(row.slice((x >> 3) * 2, (x >> 3) * 2 + 2), 16) >> (7 - (x & 7))) & 1
  })
  return m
}

function ours(image: Grey): string | undefined {
  return decode(image)?.text
}

function theirs(image: Grey): string | undefined {
  return jsQR(toRgba(image), image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data
}

const PAYLOAD = 'https://example.com/r/7f3a9c2e41b8?k=Z2l2ZSBtZSBhIHJvb20'

describe('decode', () => {
  it('reads every ZXing vector from a clean straight picture', () => {
    for (const v of vectors) {
      const image = photograph(fromRows(v.rows, v.size), v.size, { scale: v.size > 100 ? 2 : 3 })
      expect(decode(image, { inversion: 'normal' }), v.id).toMatchObject({
        text: v.text,
        version: v.version,
        ecc: v.ecc,
        mask: v.mask,
        mirrored: false,
        inverted: false,
      })
    }
  })

  it('reads inverted and mirrored codes and says so', () => {
    const qr = encode(PAYLOAD, { ecc: 'M' })
    const inverted = decode(photograph(qr.modules, qr.size, { scale: 4, invert: true }))
    expect(inverted).toMatchObject({ text: PAYLOAD, inverted: true, mirrored: false })
    const mirrored = decode(photograph(qr.modules, qr.size, { scale: 4, mirror: true }))
    expect(mirrored).toMatchObject({ text: PAYLOAD, inverted: false, mirrored: true })
    expect(decode(photograph(qr.modules, qr.size, { scale: 4, invert: true }), { inversion: 'normal' })).toBeUndefined()
  })

  it('takes RGBA, greyscale, padded rows and transparent backgrounds', () => {
    const qr = encode(PAYLOAD)
    const grey = photograph(qr.modules, qr.size, { scale: 3 })
    expect(decode({ ...grey, data: toRgba(grey) })?.text).toBe(PAYLOAD)
    const stride = grey.width + 13
    const padded = new Uint8Array(stride * grey.height).fill(7)
    for (let y = 0; y < grey.height; y++) padded.set(grey.data.subarray(y * grey.width, (y + 1) * grey.width), y * stride)
    expect(decode({ data: padded, width: grey.width, height: grey.height }, { rowStride: stride })?.text).toBe(PAYLOAD)
    // Dark modules drawn on a transparent canvas: alpha 0 everywhere else.
    const clear = toRgba(grey)
    for (let i = 0; i < grey.data.length; i++) if (grey.data[i]! > 128) clear[i * 4 + 3] = 0
    for (let i = 0; i < grey.data.length; i++) if (clear[i * 4 + 3] === 0) clear[i * 4] = clear[i * 4 + 1] = clear[i * 4 + 2] = 0
    expect(decode({ data: clear, width: grey.width, height: grey.height })?.text).toBe(PAYLOAD)
  })

  it('reports where the code is', () => {
    const qr = encode(PAYLOAD, { ecc: 'M' })
    const found = decode(photograph(qr.modules, qr.size, { scale: 4 }))!
    const { topLeft, topRight, bottomLeft } = found.location
    expect(topRight.x).toBeGreaterThan(topLeft.x)
    expect(bottomLeft.y).toBeGreaterThan(topLeft.y)
    expect(Math.abs(topRight.x - topLeft.x - (qr.size - 7) * 4)).toBeLessThan(2)
  })

  it('finds nothing in noise or a blank picture, and rejects bad input', () => {
    const random = prng(9)
    const noise = new Uint8Array(200 * 200).map(() => (random() < 0.5 ? 0 : 255))
    expect(decode({ data: noise, width: 200, height: 200 })).toBeUndefined()
    expect(decode({ data: new Uint8Array(100 * 100).fill(255), width: 100, height: 100 })).toBeUndefined()
    expect(() => decode({ data: new Uint8Array(10), width: 100, height: 100 })).toThrow(RangeError)
    expect(() => decode({ data: new Uint8Array(100), width: 0, height: 100 })).toThrow(RangeError)
    // Short data is an error whether or not channels is named.
    for (const channels of [1, 4] as const) {
      expect(() => decode({ data: new Uint8Array(10), width: 100, height: 100 }, { channels })).toThrow(RangeError)
    }
    // Enough for grey but not RGBA when RGBA is claimed.
    expect(() => decode({ data: new Uint8Array(100 * 100), width: 100, height: 100 }, { channels: 4 })).toThrow(RangeError)
    expect(decode({ data: new Uint8Array(100 * 100).fill(255), width: 100, height: 100 }, { channels: 1 })).toBeUndefined()
    expect(() => decode({ data: new Uint8Array(100 * 100), width: 100, height: 100 }, { channels: 3 as 4 })).toThrow(RangeError)
  })

  it('reads at least as many distorted pictures as jsQR', () => {
    // QR_SEED and QR_SHOTS draw a different set, to check the tuning generalises.
    const random = prng(Number(process.env.QR_SEED ?? 42))
    const shots: Shot[] = []
    for (let i = 0; i < Number(process.env.QR_SHOTS ?? 60); i++) {
      shots.push({
        scale: 2.5 + random() * 3.5,
        angle: random() * 360,
        perspective: random() * 0.3,
        noise: random() < 0.5 ? random() * 40 : 0,
        blur: random() < 0.3 ? 1 : 0,
        shade: random() < 0.4 ? 0.35 + random() * 0.4 : undefined,
        invert: random() < 0.15,
        mirror: random() < 0.1,
        seed: i + 1,
      })
    }
    const levels: ErrorCorrection[] = ['L', 'M', 'Q', 'H']
    let mine = 0
    let jsqr = 0
    let theirsOnly = 0
    const missed: string[] = []
    shots.forEach((shot, i) => {
      const text = `${PAYLOAD}&n=${i}${'x'.repeat(Math.floor(random() * 120))}`
      const qr: QrCode = encode(text, { ecc: levels[i % 4]! })
      const image = photograph(qr.modules, qr.size, shot)
      const a = ours(image) === text
      const b = theirs(image) === text
      if (a) mine++
      if (b) jsqr++
      if (b && !a) theirsOnly++
      if (!a) missed.push(`${i} v${qr.version} ${JSON.stringify(shot)}${b ? ' (jsQR read it)' : ''}`)
    })
    // QR_REPORT=<file> writes the score and the misses, for tuning.
    const report = process.env.QR_REPORT
    if (report) writeFileSync(report, `distorted: ours ${mine}/${shots.length}, jsQR ${jsqr}/${shots.length}, jsQR only ${theirsOnly}\n${missed.join('\n')}\n`)
    expect(mine).toBeGreaterThanOrEqual(jsqr)
    expect(mine).toBeGreaterThanOrEqual(Math.ceil(shots.length * 0.9))
  }, 60_000)
})

describe('decodeModules', () => {
  it('reads a grid straight and mirrored', () => {
    const qr = encode(PAYLOAD)
    expect(decodeModules(qr.modules, qr.size)).toMatchObject({ text: PAYLOAD, mirrored: false })
    const t = new Uint8Array(qr.size * qr.size)
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) t[x * qr.size + y] = qr.modules[y * qr.size + x]!
    expect(decodeModules(t, qr.size)).toMatchObject({ text: PAYLOAD, mirrored: true })
    expect(decodeModules(new Uint8Array(qr.size * qr.size), qr.size)).toBeUndefined()
  })
})
