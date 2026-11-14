import { describe, expect, it } from 'vitest'
import { ALIGNMENT_CENTRES, EC_BLOCKS } from '../src/tables.js'

/** Data and error correction modules of a version, from the symbol layout alone. */
function rawModules(v: number): number {
  let n = (16 * v + 128) * v + 64
  if (v >= 2) {
    const align = Math.floor(v / 7) + 2
    n -= (25 * align - 10) * align - 55
    if (v >= 7) n -= 36
  }
  return n
}

describe('tables', () => {
  it('has 40 versions', () => {
    expect(ALIGNMENT_CENTRES).toHaveLength(40)
    expect(EC_BLOCKS).toHaveLength(40)
  })

  it('fills every version exactly at every level', () => {
    for (let v = 1; v <= 40; v++) {
      const codewords = Math.floor(rawModules(v) / 8)
      for (const [ec, g1, d1, g2] of EC_BLOCKS[v - 1]!) {
        expect(g1 * (d1 + ec) + g2 * (d1 + 1 + ec)).toBe(codewords)
      }
    }
  })

  it('places alignment centres from 6 to size - 7, in the standard count', () => {
    for (let v = 2; v <= 40; v++) {
      const centres = ALIGNMENT_CENTRES[v - 1]!
      expect(centres).toHaveLength(Math.floor(v / 7) + 2)
      expect(centres[0]).toBe(6)
      expect(centres.at(-1)).toBe(17 + 4 * v - 7)
    }
  })
})
