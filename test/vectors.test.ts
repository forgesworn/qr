import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { encode, type ErrorCorrection, type Mode, type Segment } from '../src/index.js'
import { COUNT_BITS, countBand } from '../src/encode.js'

interface Vector {
  id: string
  text: string
  ecc: ErrorCorrection
  eci: boolean
  requestedVersion: number | null
  requestedMask: number | null
  version: number
  mask: number
  mode: Mode
  segments: Segment[]
  /** Stream length before the terminator. */
  bits: number
  /** The reference encoder's own minimal segmentation, for ASCII text without ECI. */
  reference: { version: number; bits: number } | null
  size: number
  rows: string[]
}

const { vectors } = JSON.parse(
  readFileSync(new URL('../vectors/encode-vectors.json', import.meta.url), 'utf8'),
) as { vectors: Vector[] }

function rows(modules: Uint8Array, size: number): string[] {
  const out: string[] = []
  for (let y = 0; y < size; y++) {
    let row = ''
    for (let x = 0; x < size; x += 8) {
      let b = 0
      for (let k = 0; k < 8; k++) b = (b << 1) | (x + k < size ? modules[y * size + x + k]! : 0)
      row += b.toString(16).padStart(2, '0')
    }
    out.push(row)
  }
  return out
}

/** Stream bits before the terminator for these segments at this version. */
function streamBits(segments: readonly Segment[], version: number, eci: boolean): number {
  const band = countBand(version)
  let bits = eci && segments.some((s) => s.mode === 'byte') ? 12 : 0
  for (const { mode, count } of segments) {
    bits += 4 + COUNT_BITS[mode][band]
    bits += mode === 'numeric' ? Math.floor(count / 3) * 10 + [0, 4, 7][count % 3]! : mode === 'alphanumeric' ? Math.floor(count / 2) * 11 + (count % 2) * 6 : count * 8
  }
  return bits
}

describe('encode vectors (independent reference encoder as oracle)', () => {
  it('covers every version and mask, and mixed segments', () => {
    expect(new Set(vectors.map((v) => v.version)).size).toBe(40)
    expect(new Set(vectors.map((v) => v.mask)).size).toBe(8)
    expect(vectors.filter((v) => v.segments.length > 1).length).toBeGreaterThanOrEqual(30)
    // The original 114 vectors are single-segment and the default still produces them.
    expect(vectors.slice(0, 114).every((v) => v.segments.length === 1)).toBe(true)
  })

  for (const v of vectors) {
    it(v.id, () => {
      const qr = encode(v.text, {
        ecc: v.ecc,
        eci: v.eci,
        ...(v.requestedVersion === null ? {} : { version: v.requestedVersion }),
        ...(v.requestedMask === null ? {} : { mask: v.requestedMask }),
      })
      expect({ version: qr.version, mask: qr.mask, mode: qr.mode, size: qr.size, segments: qr.segments }).toEqual({
        version: v.version,
        mask: v.mask,
        mode: v.mode,
        size: v.size,
        segments: v.segments,
      })
      expect(streamBits(qr.segments, qr.version, v.eci)).toBe(v.bits)
      expect(rows(qr.modules, qr.size)).toEqual(v.rows)
    })
  }

  it('never needs more bits or a larger version than the reference encoder’s minimal mode', () => {
    const fewer: string[] = []
    for (const v of vectors) {
      if (!v.reference) continue
      expect(v.bits, v.id).toBeLessThanOrEqual(v.reference.bits)
      if (v.requestedVersion === null) expect(v.version, v.id).toBeLessThanOrEqual(v.reference.version)
      if (v.bits < v.reference.bits) fewer.push(v.id)
    }
    // The reference's minimal mode spends 256 bits on "item ABC...12...": as
    // many as byte "item " then alphanumeric then numeric. Moving the space
    // into the alphanumeric segment gives 254, which the brute-force test in
    // encode.test.ts confirms is the least for that shape.
    expect(fewer).toEqual(['mixed-three-modes'])
  })
})
