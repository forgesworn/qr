import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { encode, type ErrorCorrection, type Mode } from '../src/index.js'

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

describe('encode vectors (ZXing as oracle)', () => {
  it('covers every version and mask', () => {
    expect(new Set(vectors.map((v) => v.version)).size).toBe(40)
    expect(new Set(vectors.map((v) => v.mask)).size).toBe(8)
  })

  for (const v of vectors) {
    it(v.id, () => {
      const qr = encode(v.text, {
        ecc: v.ecc,
        eci: v.eci,
        ...(v.requestedVersion === null ? {} : { version: v.requestedVersion }),
        ...(v.requestedMask === null ? {} : { mask: v.requestedMask }),
      })
      expect({ version: qr.version, mask: qr.mask, mode: qr.mode, size: qr.size }).toEqual({
        version: v.version,
        mask: v.mask,
        mode: v.mode,
        size: v.size,
      })
      expect(rows(qr.modules, qr.size)).toEqual(v.rows)
    })
  }
})
