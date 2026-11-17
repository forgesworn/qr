// The search's work on frames built to be costly, counted rather than timed,
// so the bounds hold on any machine. The counter is internal to the package.
import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { type Work } from '../src/locate.js'
import { prng } from './photo.js'

interface Frame { data: Uint8Array; width: number; height: number }

function counted(image: Frame): { found: boolean; work: Work } {
  const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0 }
  const found = decodeCounted(image, {}, work) !== undefined
  return { found, work }
}

/** The mesh's points probed a frame, at most: 8 second looks, at most two passes of 46 lattice points, 25 x 25 offsets, 25 modules. */
const MESH_PROBES = 8 * 92 * 25 * 25 * 25

const perPixel = ({ work }: { work: Work }, image: Frame) => (work.steps + work.compared + work.scanned) / (image.width * image.height)

/** Finder patterns with 1 px modules on a 10 px pitch: every cell a finder, no symbol. */
function tiled(width: number, height: number): Frame {
  const data = new Uint8Array(width * height).fill(255)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = x % 10
      const j = y % 10
      if (i < 7 && j < 7 && Math.max(Math.abs(i - 3), Math.abs(j - 3)) !== 2) data[y * width + x] = 0
    }
  }
  return { data, width, height }
}

/** Full-height stripes in 1:1:3:1:1, so every row is a run of finder candidates. */
function stripes(width: number, height: number): Frame {
  const pattern = [0, 255, 0, 0, 0, 255, 0, 255, 255]
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = pattern[x % 9]!
  return { data, width, height }
}

describe('bounded work', () => {
  it('grows in step with the pixels on frames full of finder patterns', () => {
    for (const make of [tiled, stripes]) {
      const small = make(800, 800)
      const large = make(1600, 1600)
      const a = counted(small)
      const b = counted(large)
      expect(a.found || b.found).toBe(false)
      expect(perPixel(a, small)).toBeLessThan(1.5)
      expect(perPixel(b, large)).toBeLessThan(1.5)
      // Four times the pixels, not much more than four times the work.
      expect(perPixel(b, large)).toBeLessThan(perPixel(a, small) * 1.1)
      expect(a.work.second + b.work.second).toBeLessThanOrEqual(2 * 8)
      expect(a.work.probed + b.work.probed).toBeLessThanOrEqual(2 * MESH_PROBES)
    }
  })

  it('samples no more maps than the caps allow on noise', () => {
    const random = prng(11)
    const image = { data: Uint8Array.from({ length: 640 * 480 }, () => Math.floor(random() * 256)), width: 640, height: 480 }
    const result = counted(image)
    expect(result.found).toBe(false)
    // Four passes, six triples, five sizes, at most six maps a size.
    expect(result.work.maps).toBeLessThanOrEqual(4 * 6 * 5 * 6)
    // The original four second looks may be followed by three terminal retries.
    expect(result.work.second).toBeLessThanOrEqual(8)
    // Each of them searches at most 92 patterns across two passes, at 25 x 25
    // quarter-module offsets of 25 modules.
    expect(result.work.probed).toBeLessThanOrEqual(MESH_PROBES)
    // Each of the 120 locates scans at most six windows, each no bigger than
    // the picture; in practice the windows cover it about five times over.
    expect(perPixel(result, image)).toBeLessThan(8)
  })
})
