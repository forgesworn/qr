import { describe, expect, it } from 'vitest'
import { binarise, invertLuminance, thresholds, toLuminance } from '../src/binarise.js'
import { decodeCounted } from '../src/decode.js'
import { encode } from '../src/encode.js'
import { type Work } from '../src/locate.js'
import { photograph, prng } from './photo.js'

describe('inverted luminance thresholds', () => {
  const text = 'https://example.com/inverted/0123456789'
  const qr = encode(text)

  it.each([[2, 0], [3, 0], [3, 17], [3, 39], [4, 39], [4, 71]])(
    'reads shaded low-contrast light modules at scale %i and angle %i', (scale, angle) => {
      const image = photograph(qr.modules, qr.size, { scale, angle, invert: true, shade: 0.7 })
      image.data = Uint8Array.from(image.data, (v) => Math.round(90 + v / 3))
      for (const inversion of ['both', 'inverted'] as const) {
        const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0 }
        const found = decodeCounted(image, { inversion }, work)
        expect(found?.text).toBe(text)
        expect(found?.bytes).toEqual(new TextEncoder().encode(text))
        expect(found?.inverted).toBe(true)
        expect(work.maps).toBeLessThanOrEqual(720)
        expect(work.second).toBeLessThanOrEqual(4)
      }
      expect(decodeCounted(image, { inversion: 'normal' })).toBeUndefined()
    },
  )

  it('skips uniform, near-uniform, globally thresholded and high-dynamic-range noise frames', () => {
    for (const level of [0, 127, 255]) {
      expect(thresholds({ data: new Uint8Array(80 * 80).fill(level), width: 80, height: 80 }).invertedFallback).toBe(false)
    }
    const random = prng(20261116)
    for (const span of [24, 256]) {
      const image = { data: Uint8Array.from({ length: 80 * 80 }, () => Math.floor(random() * span)), width: 80, height: 80 }
      expect(thresholds(image).invertedFallback).toBe(false)
    }
    expect(thresholds({ data: Uint8Array.of(0, 255), width: 2, height: 1 }).invertedFallback).toBe(false)
  })

  it('preserves exact block means when dynamic range first appears on any row', () => {
    for (let row = 0; row < 8; row++) {
      const image = { data: new Uint8Array(40 * 40).fill(100), width: 40, height: 40 }
      for (let by = 0; by < 5; by++) for (let bx = 0; bx < 5; bx++) image.data[(by * 8 + row) * 40 + bx * 8] = 200
      const level = (63 * 100 + 200) / 64
      expect([...thresholds(image).values]).toEqual(new Array(25).fill(level))
      expect(binarise(image).data.reduce((sum, v) => sum + v, 0)).toBe(25 * 63)
      expect(invertLuminance(invertLuminance(image))).toEqual(image)
    }
  })

  it('recognises uniform luminance after alpha blending, including padded and small images', () => {
    for (const [width, height] of [[2, 3], [40, 40], [47, 53], [128, 72]] as const) {
      const rowStride = width + 3
      const data = new Uint8Array(rowStride * height * 4).fill(91)
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = 4 * (y * rowStride + x)
        data[i] = x % 256
        data[i + 1] = y % 256
        data[i + 3] = 0
      }
      const image = toLuminance(data, width, height, 4, rowStride)
      expect(thresholds(image).uniform).toBe(true)
      const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0 }
      expect(decodeCounted({ data, width, height }, { rowStride, channels: 4 }, work)).toBeUndefined()
      expect(Object.values(work).every((v) => v === 0)).toBe(true)
      image.data[image.data.length - 1] = 0
      expect(thresholds(image).uniform).toBe(false)
    }
  })
})
