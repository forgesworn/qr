import { describe, expect, it } from 'vitest'
import { toLuminance } from '../src/binarise.js'

/** The conversion as SPEC states it, one byte at a time. */
function reference(data: Uint8Array | Uint8ClampedArray, width: number, height: number, stride: number): Uint8Array {
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * stride + x) * 4
      const a = data[i + 3]!
      const grey = (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) >> 8
      out[y * width + x] = a === 255 ? grey : (grey * a + 255 * (255 - a)) / 255
    }
  }
  return out
}

describe('RGBA luminance', () => {
  it('matches the byte-by-byte conversion for every alignment, stride and alpha', () => {
    let seed = 0x1badc0de
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 24
    for (const [width, height, pad] of [[1, 1, 0], [3, 2, 0], [7, 5, 3], [40, 41, 0], [65, 9, 1]] as const) {
      const stride = width + pad
      for (const offset of [0, 1, 2, 3, 4]) {
        for (const clamped of [false, true]) {
          const bytes = (stride * (height - 1) + width) * 4
          const backing = new Uint8Array(bytes + offset + 8)
          for (let i = 0; i < backing.length; i++) backing[i] = next()
          // Every alpha value, opaque most often as camera frames are.
          for (let i = offset + 3; i < offset + bytes; i += 4) if (next() < 128) backing[i] = 255
          const view = clamped ? new Uint8ClampedArray(backing.buffer, offset, bytes) : backing.subarray(offset, offset + bytes)
          const expected = reference(view, width, height, stride)
          expect(toLuminance(view, width, height, 4, stride).data).toEqual(expected)
          const storage = new Uint8Array(width * height + 5).subarray(0, width * height)
          expect(toLuminance(view, width, height, 4, stride, storage).data).toEqual(expected)
        }
      }
    }
  })
})
