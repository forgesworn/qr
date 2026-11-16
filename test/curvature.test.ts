import { describe, expect, it } from 'vitest'
import { encode, FORMAT_COORDS, formatBits, versionBits } from '../src/encode.js'
import { curvatureHeader, readVersion } from '../src/symbol.js'

function fixture() {
  const qr = encode('Curved sheet test payload', { version: 12, ecc: 'M', mask: 3 })
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

describe('deferred curvature admission', () => {
  it('uses an exact version anchor when the peer headers cannot be decoded', () => {
    const f = fixture()
    f.version(1, 0)
    f.format(0, 0)
    f.format(1, formatBits('M', 3) ^ 1)
    expect(curvatureHeader(f.read, f.size)).toEqual({ ecc: 'M', mask: 3, distance: 1 })
  })

  it('does not admit merely correctable version evidence', () => {
    const f = fixture()
    f.version(0, versionBits(12) ^ 1)
    f.version(1, versionBits(12) ^ 2)
    expect(readVersion(f.read, f.size)).toBe(12)
    expect(curvatureHeader(f.read, f.size)).toBeUndefined()
  })

  it('rejects a conflicting independently readable version', () => {
    const f = fixture()
    f.version(1, versionBits(13) ^ 1)
    expect(curvatureHeader(f.read, f.size)).toBeUndefined()
  })

  it('rejects conflicting independently readable formats', () => {
    const f = fixture()
    f.format(1, formatBits('Q', 7) ^ 1)
    expect(curvatureHeader(f.read, f.size)).toBeUndefined()
  })

  it('requires a readable format even with exact version evidence', () => {
    const f = fixture()
    f.format(0, 0)
    f.format(1, 0)
    expect(curvatureHeader(f.read, f.size)).toBeUndefined()
  })

  it('does not treat an exact different version as a size hint', () => {
    const f = fixture()
    f.version(0, versionBits(13))
    f.version(1, 0)
    expect(curvatureHeader(f.read, f.size)).toBeUndefined()
  })

  it('requires a version block, absent below version 7', () => {
    expect(curvatureHeader(() => false, 41)).toBeUndefined()
  })
})
