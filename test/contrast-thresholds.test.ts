import { describe, expect, it } from 'vitest'
import { binarise, contrastThresholds, levelBlocks, thresholds, type Luminance } from '../src/binarise.js'
import { decodeCounted } from '../src/decode.js'
import { type Work } from '../src/locate.js'
import { prng } from './photo.js'
import { contrastPicture } from './contrast-thresholds-fixture.js'

/** The rule as SPEC.md states it, written out directly. */
function reference(image: Luminance): number[] | undefined {
  const { data, width, height } = image
  const across = Math.ceil(width / 8), down = Math.ceil(height / 8)
  const blocks = levelBlocks(image)!
  const original = thresholds(image)
  const values: number[] = []
  let moved = false
  for (let by = 0; by < down; by++) {
    for (let bx = 0; bx < across; bx++) {
      const cy = Math.min(Math.max(by, 2), down - 3), cx = Math.min(Math.max(bx, 2), across - 3)
      const window: number[] = []
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) window.push((cy + dy) * across + cx + dx)
      const contrasted = window.filter((k) => blocks.flats[k] === 0)
      const before = original.values[by * across + bx]!
      if (contrasted.length === 0 || contrasted.length === 25) {
        values.push(before)
        continue
      }
      let sum = 0
      for (const k of contrasted) sum += blocks.levels[k]!
      const after = sum / contrasted.length
      values.push(after)
      const top = Math.min(by * 8, height - 8), left = Math.min(bx * 8, width - 8)
      for (let y = top; y < top + 8; y++) for (let x = left; x < left + 8; x++) {
        const v = data[y * width + x]!
        if ((v <= before) !== (v <= after)) moved = true
      }
    }
  }
  return moved ? values : undefined
}

function flatWith(width: number, height: number, paint: (x: number, y: number) => number | undefined, paper = 200): Luminance {
  const data = new Uint8Array(width * height).fill(paper)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = paint(x, y)
    if (v !== undefined) data[y * width + x] = v
  }
  return { data, width, height }
}

describe('contrast-only thresholds', () => {
  it('leave the ordinary thresholds unchanged when given the same block levels', () => {
    const random = prng(5)
    const image = flatWith(61, 45, (x, y) => (x > 20 && y > 12 && x < 44 && y < 33 ? Math.floor(random() * 256) : undefined))
    expect(thresholds(image, levelBlocks(image))).toEqual(thresholds(image))
    expect(levelBlocks({ data: new Uint8Array(39 * 60), width: 39, height: 60 })).toBeUndefined()
  })

  it('drop flat blocks only from averages that mix them with contrasted blocks', () => {
    const random = prng(11)
    for (const [width, height] of [[48, 48], [61, 45], [80, 41], [100, 100]] as const) {
      // A faint patch on flat paper, its edges away from block boundaries.
      const image = flatWith(width, height, (x, y) => (x > 13 && y > 11 && x < width - 17 && y < height - 9 ? 150 + Math.floor(random() * 60) : undefined))
      const expected = reference(image)
      expect(expected, `${width} x ${height}`).toBeDefined()
      const got = contrastThresholds(image, levelBlocks(image)!)
      expect(got && [...got.values], `${width} x ${height}`).toEqual(expected)
      expect(got?.across).toBe(Math.ceil(width / 8))
      // The binary picture differs only where a threshold changed.
      const before = binarise(image).data, after = binarise(image, got!).data
      expect(after).not.toEqual(before)
    }
  })

  it('are undefined when no pixel would change side', () => {
    const random = prng(3)
    const noise = flatWith(64, 64, () => Math.floor(random() * 256))
    expect(contrastThresholds(noise, levelBlocks(noise)!)).toBeUndefined()
    const blank = flatWith(64, 64, () => undefined)
    expect(contrastThresholds(blank, levelBlocks(blank)!)).toBeUndefined()
    // Black glyphs on white paper: every threshold moves, but no pixel lies between.
    const print = flatWith(96, 64, (x, y) => (x > 15 && x < 80 && y > 15 && y < 48 && (x % 7 < 3) && (y % 9 < 6) ? 10 : undefined), 245)
    expect(reference(print)).toBeUndefined()
    expect(contrastThresholds(print, levelBlocks(print)!)).toBeUndefined()
    // Under 25 levels of range everything is flat.
    const faint = flatWith(64, 64, (x, y) => (x > 20 && x < 40 && y > 20 && y < 40 ? 180 : undefined))
    expect(contrastThresholds(faint, levelBlocks(faint)!)).toBeUndefined()
  })
})

describe('terminal contrast-threshold search', () => {
  it.each(['dark', 'light', 'second-look'] as const)('reads the faint %s code on flat paper', (name) => {
    const f = contrastPicture(name)
    const before = f.image.data.slice()
    const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    const result = decodeCounted(f.image, {}, work)
    expect(result?.text).toBe(f.text)
    expect(result?.version).toBe(f.version)
    expect(result?.ecc).toBe(f.ecc)
    expect(result?.inverted).toBe(f.inverted)
    expect(contrastThresholds(f.image, levelBlocks(f.image)!)).toBeDefined()
    // The ordinary search never located a symbol: the read is step 23's.
    expect(work.maps).toBe(0)
    expect(work.second).toBe(0)
    expect(f.image.data).toEqual(before)
  })

  it('refuses a faint decoy with real finder patterns', () => {
    const f = contrastPicture('decoy')
    expect(contrastThresholds(f.image, levelBlocks(f.image)!)).toBeDefined()
    const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    expect(decodeCounted(f.image, {}, work)).toBeUndefined()
    expect(work.maps).toBe(0)
  })

  it('refuses a faint code whose two format copies disagree', () => {
    // Without the format gate the search reads this code from its intact second copy.
    const f = contrastPicture('format-gate')
    expect(contrastThresholds(f.image, levelBlocks(f.image)!)).toBeDefined()
    const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    expect(decodeCounted(f.image, {}, work)).toBeUndefined()
    expect(work.maps).toBe(0)
  })

  it('honours the requested polarity', () => {
    expect(decodeCounted(contrastPicture('light').image, { inversion: 'normal' })).toBeUndefined()
    expect(decodeCounted(contrastPicture('dark').image, { inversion: 'inverted' })).toBeUndefined()
  })
})
