import { describe, expect, it } from 'vitest'
import { encode, FORMAT_COORDS, formatBits, versionBits } from '../src/encode.js'
import { curvatureHeader } from '../src/symbol.js'
import { formatAgrees } from '../src/refine.js'

function fixture() {
  const qr = encode('Header conflict regression', { version: 12, ecc: 'M', mask: 3 })
  const read = (x: number, y: number) => qr.modules[y * qr.size + x] === 1
  const format = (copy: number, word: number) => {
    for (let i = 0; i < 15; i++) {
      const [x, y] = copy === 0 ? FORMAT_COORDS[i]! : [i < 8 ? qr.size - 1 - i : 8, i < 8 ? 8 : qr.size - 7 + i - 8]
      qr.modules[y! * qr.size + x!] = (word >>> i) & 1
    }
  }
  const version = (copy: number, word: number) => {
    for (let k = 0; k < 18; k++) {
      const i = Math.floor(k / 3), j = qr.size - 11 + k % 3
      qr.modules[(copy === 0 ? j : i) * qr.size + (copy === 0 ? i : j)] = (word >>> k) & 1
    }
  }
  return { ...qr, read, format, version }
}

describe('separate conflicting-format admission', () => {
  for (const strongerCopy of [0, 1]) for (const errors of [0, 1, 2]) {
    it(`admits copy ${strongerCopy} at distance ${errors} only as a separate retry`, () => {
      const f = fixture()
      f.format(strongerCopy, formatBits('M', 3) ^ ((1 << errors) - 1))
      f.format(1 - strongerCopy, formatBits('Q', 7) ^ 7)
      expect(curvatureHeader(f.read, f.size)).toBeUndefined()
      expect(curvatureHeader(f.read, f.size, true)).toEqual({ ecc: 'M', mask: 3, distance: errors, conflict: true })
      // Admission cannot make these conflicting pixels a strict final reading.
      expect(formatAgrees(f.read, f.size, 'M', 3)).toBe(false)
    })
  }

  it('rejects a three-error tie and two independently strong conflicting copies', () => {
    const f = fixture()
    f.format(0, formatBits('M', 3) ^ 7)
    f.format(1, formatBits('Q', 7) ^ 7)
    expect(curvatureHeader(f.read, f.size, true)).toBeUndefined()
    f.format(0, formatBits('M', 3) ^ 1)
    f.format(1, formatBits('Q', 7) ^ 3)
    expect(curvatureHeader(f.read, f.size, true)).toBeUndefined()
  })

  it('keeps matching formats on the ordinary path even at unequal distances', () => {
    const f = fixture()
    f.format(0, formatBits('M', 3) ^ 1)
    f.format(1, formatBits('M', 3) ^ 7)
    const ordinary = { ecc: 'M', mask: 3, distance: 1 }
    expect(curvatureHeader(f.read, f.size)).toEqual(ordinary)
    expect(curvatureHeader(f.read, f.size, true)).toEqual(ordinary)
  })

  it('retains the exact version anchor and nonconflicting peer requirements', () => {
    const f = fixture()
    f.format(0, formatBits('M', 3))
    f.format(1, formatBits('Q', 7) ^ 7)
    f.version(0, versionBits(12) ^ 1)
    f.version(1, versionBits(12) ^ 2)
    expect(curvatureHeader(f.read, f.size, true)).toBeUndefined()
    f.version(0, versionBits(12))
    f.version(1, versionBits(13) ^ 1)
    expect(curvatureHeader(f.read, f.size, true)).toBeUndefined()
    expect(curvatureHeader(() => false, 41, true)).toBeUndefined()
  })
})
