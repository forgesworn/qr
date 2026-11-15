// The reduced-size pass (SPEC.md, decoder step 9): the shrink's exact
// arithmetic, a close-up whose large modules carry scan lines and noise,
// which reads only once the picture is shrunk, and the format gate a read
// there must pass. The Kotlin port builds the same frames from the same
// generator (ReducedTest.kt).
import { describe, expect, it } from 'vitest'
import { reductions, shrink, type Luminance } from '../src/binarise.js'
import { decodeCounted } from '../src/decode.js'
import { encode, FORMAT_COORDS } from '../src/encode.js'
import { type Work } from '../src/locate.js'
import { prng } from './photo.js'

const TEXT = 'https://example.com/close-up'
const MODULE = 24

/**
 * The code at 24 px a module, four modules of quiet zone, a dark scan line
 * every third row across everything, and seeded noise of up to 12 either way.
 * With `invert`, light and dark change places, the scan lines too. `damage`
 * turns over that many modules of the format copy beside the top-left finder,
 * `lines` false leaves the scan lines out, and `mirror` draws the symbol
 * turned over about its diagonal.
 */
function closeUp(invert: boolean, damage = 0, lines = true, mirror = false): { data: Uint8Array; width: number; height: number } {
  const qr = encode(TEXT, { ecc: 'M' })
  const modules = Uint8Array.from(qr.modules)
  for (let i = 0; i < damage; i++) {
    const [x, y] = FORMAT_COORDS[i]!
    modules[y * qr.size + x]! ^= 1
  }
  const side = (qr.size + 8) * MODULE
  const data = new Uint8Array(side * side)
  const random = prng(7)
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / MODULE) - 4
      const my = Math.floor(y / MODULE) - 4
      const dark = (mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && modules[mirror ? mx * qr.size + my : my * qr.size + mx] === 1) || (lines && y % 3 === 0)
      const v = (dark !== invert ? 40 : 215) + Math.floor((random() * 2 - 1) * 12)
      data[y * side + x] = Math.max(0, Math.min(255, v))
    }
  }
  return { data, width: side, height: side }
}

const counter = (): Work => ({ steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 })

describe('reduced-size pass', () => {
  it('shrinks by whole boxes, rounding half up and dropping the remainder', () => {
    // 5 x 3 by 2: two columns and one row, the last column and row dropped.
    const image = { data: Uint8Array.from([0, 1, 2, 3, 99, 4, 5, 6, 8, 99, 99, 99, 99, 99, 99]), width: 5, height: 3 }
    const small = shrink(image, 2)
    expect([small.width, small.height]).toEqual([2, 1])
    // (0 + 1 + 4 + 5 + 2) div 4 = 3; (2 + 3 + 6 + 8 + 2) div 4 = 5.
    expect([...small.data]).toEqual([3, 5])
    // 8 x 8 boxes: (sum + 32) div 64.
    const flat = { data: new Uint8Array(64).fill(255), width: 8, height: 8 }
    expect([...shrink(flat, 8).data]).toEqual([255])
    const half = { data: Uint8Array.from({ length: 64 }, (_, i) => (i < 32 ? 1 : 0)), width: 8, height: 8 }
    expect([...shrink(half, 8).data]).toEqual([1])
  })

  it('shrinks by 2, 4 and 8 from one pass to the same pictures', () => {
    // Sides that leave every remainder, and some too small for a square of 8.
    const random = prng(53)
    for (const [width, height] of [[64, 64], [65, 71], [67, 62], [103, 9], [9, 103], [5, 3], [200, 131]] as const) {
      const image: Luminance = { data: Uint8Array.from({ length: width * height }, () => Math.floor(random() * 256)), width, height }
      const shrunk = reductions(image)
      // Asked for in the decoder's order, coarse to fine, and then again.
      for (const f of [8, 4, 2, 8, 2, 4] as const) expect(shrunk(f), `${width} x ${height} by ${f}`).toEqual(shrink(image, f))
    }
    const white: Luminance = { data: new Uint8Array(24 * 16).fill(255), width: 24, height: 16 }
    expect(reductions(white)(8).data).toEqual(new Uint8Array(6).fill(255))
  })

  it('reads a close-up with scan lines only at reduced size, located in the full picture', () => {
    const frame = closeUp(false)
    const work = counter()
    const got = decodeCounted(frame, {}, work)
    expect(got?.text).toBe(TEXT)
    // The pass runs only when nothing read at full size.
    expect(work.reduced).toBeGreaterThan(0)
    expect(work.maps).toBeLessThanOrEqual(4 * 6 * 5 * 6)
    expect(work.second).toBeLessThanOrEqual(4)
    // The top-left finder's centre is 7.5 modules in from each edge: mapped
    // back by x * f, within a pixel.
    expect(Math.abs(got!.location.topLeft.x - 7.5 * MODULE)).toBeLessThan(1)
    expect(Math.abs(got!.location.topLeft.y - 7.5 * MODULE)).toBeLessThan(1)
  })

  it('honours the inversion option at reduced size', () => {
    const frame = closeUp(true)
    const work = counter()
    const got = decodeCounted(frame, {}, work)
    expect(got?.text).toBe(TEXT)
    expect(got?.inverted).toBe(true)
    expect(work.reduced).toBeGreaterThan(0)
    expect(decodeCounted(frame, { inversion: 'normal' })).toBeUndefined()
    expect(decodeCounted(closeUp(false), { inversion: 'inverted' })).toBeUndefined()
  })

  it('refuses a read at reduced size whose format copies do not both agree', () => {
    // Two modules of one copy turned over: both copies lie within 2 bits of
    // the format word, so the close-up reads as before.
    const two = counter()
    expect(decodeCounted(closeUp(false, 2), {}, two)?.text).toBe(TEXT)
    expect(two.reduced).toBeGreaterThan(0)
    // Three: the other copy still gives the level and mask, and without scan
    // lines the symbol reads at full size, where one copy is enough.
    const plain = counter()
    expect(decodeCounted(closeUp(false, 3, false), {}, plain)?.text).toBe(TEXT)
    expect(plain.reduced).toBe(0)
    // With them it can only be read at reduced size, and is refused there.
    const three = counter()
    expect(decodeCounted(closeUp(false, 3), {}, three)).toBeUndefined()
    expect(three.reduced).toBeGreaterThan(0)
  })

  it('holds a mirrored read at reduced size to the same gate', () => {
    const two = counter()
    const got = decodeCounted(closeUp(false, 2, true, true), {}, two)
    expect(got?.text).toBe(TEXT)
    expect(got?.mirrored).toBe(true)
    expect(two.reduced).toBeGreaterThan(0)
    const three = counter()
    expect(decodeCounted(closeUp(false, 3, true, true), {}, three)).toBeUndefined()
    expect(three.reduced).toBeGreaterThan(0)
  })
})
