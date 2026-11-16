import { describe, expect, it } from 'vitest'
import { createDecoder, decode, encode, type DecodeOptions, type ImageLike } from '../src/index.js'

function frame(text: string, x = 200, y = 130, width = 960, height = 640, inverted = false): ImageLike {
  const qr = encode(text)
  const scale = 5
  const data = new Uint8Array(width * height).fill(inverted ? 20 : 235)
  for (let my = 0; my < qr.size; my++) for (let mx = 0; mx < qr.size; mx++) {
    if (!qr.modules[my * qr.size + mx]) continue
    for (let dy = 0; dy < scale; dy++) data.fill(inverted ? 235 : 20, (y + my * scale + dy) * width + x + mx * scale, (y + my * scale + dy) * width + x + (mx + 1) * scale)
  }
  return { data, width, height }
}

describe('camera decoder', () => {
  it('reads changed payloads from fresh pixels and preserves the caller buffer and previous result', () => {
    const camera = createDecoder()
    const image = frame('https://example.com/first')
    const original = image.data.slice()
    const first = camera.decode(image)!
    expect(first.text).toBe('https://example.com/first')
    expect(image.data).toEqual(original)
    image.data.set(frame('https://example.com/other').data)
    expect(camera.decode(image)?.text).toBe('https://example.com/other')
    expect(first.text).toBe('https://example.com/first')
    expect(new TextDecoder().decode(first.bytes)).toBe(first.text)
    image.data.fill(235)
    expect(camera.decode(image)).toBeUndefined()
  })

  it('recovers on the same call after movement outside the previous region or a change of dimensions', () => {
    const camera = createDecoder()
    for (const image of [frame('one'), frame('two', 730, 400), frame('three', 10, 20, 320, 240), frame('four')]) {
      const found = camera.decode(image)!
      const full = decode(image)!
      expect(found.text).toBe(full.text)
      expect(found.location.topLeft.x).toBeCloseTo(full.location.topLeft.x, 6)
      expect(found.location.topLeft.y).toBeCloseTo(full.location.topLeft.y, 6)
    }
  })

  it('uses the current polarity options on every frame and forgets state on reset', () => {
    const camera = createDecoder()
    expect(camera.decode(frame('normal'))?.text).toBe('normal')
    const inverted = frame('inverted', 200, 130, 960, 640, true)
    expect(camera.decode(inverted, { inversion: 'normal' })).toBeUndefined()
    expect(camera.decode(inverted, { inversion: 'inverted' })).toMatchObject({ text: 'inverted', inverted: true })
    camera.reset()
    camera.reset()
    expect(camera.decode(frame('reset'))?.text).toBe('reset')
  })

  it('keeps sessions independent and handles padded grey and RGBA inputs', () => {
    const a = createDecoder(), b = createDecoder()
    for (const channels of [1, 4] as const) {
      const image = frame('padded')
      const rowStride = image.width + 13
      const padded = new Uint8Array((rowStride * (image.height - 1) + image.width) * channels)
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        const at = (y * rowStride + x) * channels
        for (let c = 0; c < channels; c++) padded[at + c] = c === 3 ? 255 : image.data[y * image.width + x]!
      }
      for (let repeat = 0; repeat < 2; repeat++) {
        expect(a.decode({ ...image, data: padded }, { rowStride, channels })?.text).toBe('padded')
        expect(b.decode(frame('independent', 700, 400))?.text).toBe('independent')
      }
      a.reset()
    }
  })

  it('validates the whole frame even when a previous region would fit inside invalid data', () => {
    const camera = createDecoder()
    const image = frame('validation')
    camera.decode(image)
    const bad: [ImageLike, DecodeOptions][] = [
      [{ ...image, data: image.data.subarray(0, image.data.length - 1) }, {}],
      [image, { rowStride: image.width - 1 }],
      [image, { channels: 3 as never }],
      [image, { inversion: 'invalid' as never }],
      [{ ...image, width: Infinity }, {}],
    ]
    for (const [input, options] of bad) expect(() => camera.decode(input, options)).toThrow(RangeError)
    expect(() => camera.decode(null as never)).toThrow(TypeError)
  })
})
