import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { blocksFor, Grid } from '../src/encode.js'
import { encode, type ErrorCorrection } from '../src/index.js'
import { readSymbol } from '../src/symbol.js'

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

const reader = (m: Uint8Array, size: number) => (x: number, y: number) => m[y * size + x] === 1

describe('readSymbol', () => {
  it('reads every ZXing vector', () => {
    for (const v of vectors) {
      const m = fromRows(v.rows, v.size)
      const got = readSymbol(reader(m, v.size), v.size)
      expect(got, v.id).toMatchObject({ text: v.text, version: v.version, ecc: v.ecc, mask: v.mask, corrected: 0 })
    }
  })

  it('reads arbitrary bytes and reports ECI', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    const qr = encode(bytes)
    expect(readSymbol(reader(qr.modules, qr.size), qr.size)?.bytes).toEqual(bytes)
    const eci = encode('café', { eci: true })
    expect(readSymbol(reader(eci.modules, eci.size), eci.size)).toMatchObject({ text: 'café', eci: [26] })
  })

  it('corrects up to half the check codewords in every block, and no more', () => {
    for (const [version, ecc] of [[1, 'L'], [5, 'Q'], [12, 'H'], [40, 'M']] as const) {
      const text = 'x'.repeat(Math.max(1, version * 4))
      const qr = encode(text, { version, ecc })
      const [ecPerBlock] = blocksFor(version, ecc)
      // Flip whole data modules of the first codewords: corrupt `n` codewords per block.
      const flipped = (n: number) => {
        const m = qr.modules.slice()
        const grid = new Grid(version)
        const s = qr.size
        // Walk the zigzag and flip the first bit of the first n*blocks codewords.
        let bit = 0
        let upward = true
        const [, g1, , g2] = blocksFor(version, ecc)
        const limit = n * (g1 + g2)
        for (let right = s - 1; right >= 1; right -= 2) {
          if (right === 6) right = 5
          for (let step = 0; step < s; step++) {
            const y = upward ? s - 1 - step : step
            for (let i = 0; i < 2; i++) {
              const x = right - i
              if (grid.isReserved(x, y)) continue
              if (bit % 8 === 0 && bit / 8 < limit) m[y * s + x]! ^= 1
              bit++
            }
          }
          upward = !upward
        }
        return m
      }
      const fixable = Math.floor(ecPerBlock / 2)
      expect(readSymbol(reader(flipped(fixable), qr.size), qr.size), `${version}${ecc}`).toMatchObject({ text, corrected: fixable * (blocksFor(version, ecc)[1] + blocksFor(version, ecc)[3]) })
      expect(readSymbol(reader(flipped(fixable + 1), qr.size), qr.size)?.text, `${version}${ecc} over`).not.toBe(text)
    }
  })

  it('survives up to three bad bits in each format copy', () => {
    const qr = encode('HELLO', { ecc: 'H', mask: 5 })
    const m = qr.modules.slice()
    for (const [x, y] of [[8, 0], [8, 1], [8, 2]]) m[y! * qr.size + x!]! ^= 1
    expect(readSymbol(reader(m, qr.size), qr.size)).toMatchObject({ text: 'HELLO', ecc: 'H', mask: 5 })
  })

  it('rejects sizes that are not a symbol', () => {
    expect(readSymbol(() => false, 22)).toBeUndefined()
    expect(readSymbol(() => false, 21)).toBeUndefined()
  })
})
