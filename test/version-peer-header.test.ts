import { describe, expect, it } from 'vitest'
import { encode, FORMAT_COORDS, formatBits, versionBits } from '../src/encode.js'
import { curvatureHeader, versionPeerHeader } from '../src/symbol.js'
import { formatAgrees } from '../src/refine.js'

function fixture() {
  const qr = encode('Version peer admission regression', { version: 12, ecc: 'M', mask: 3 })
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

describe('separate conflicting-version admission', () => {
  for (const exactCopy of [0, 1]) {
    it(`admits exact copy ${exactCopy} only with the conflicting peer at distance three`, () => {
      const f = fixture()
      f.version(exactCopy, versionBits(12))
      f.version(1 - exactCopy, versionBits(13) ^ 7)
      f.format(0, formatBits('M', 3) ^ 7)
      f.format(1, formatBits('M', 3) ^ 7)
      expect(curvatureHeader(f.read, f.size, true)).toBeUndefined()
      expect(versionPeerHeader(f.read, f.size)).toEqual({ ecc: 'M', mask: 3, distance: 3 })
      // Retry eligibility does not bypass the stricter final two-copy gate.
      expect(formatAgrees(f.read, f.size, 'M', 3)).toBe(false)
    })
  }

  it('requires an exact anchor for the sampled size', () => {
    const f = fixture()
    f.version(0, versionBits(12) ^ 1)
    f.version(1, versionBits(13) ^ 7)
    expect(versionPeerHeader(f.read, f.size)).toBeUndefined()
    f.version(0, versionBits(13))
    f.version(1, versionBits(13) ^ 7)
    expect(versionPeerHeader(f.read, f.size)).toBeUndefined()
  })

  it('rejects stronger contradictory peers and matching or unreadable peers', () => {
    const f = fixture()
    for (const errors of [0, 1, 2]) {
      f.version(1, versionBits(13) ^ ((1 << errors) - 1))
      expect(versionPeerHeader(f.read, f.size)).toBeUndefined()
    }
    f.version(1, versionBits(12) ^ 7)
    expect(versionPeerHeader(f.read, f.size)).toBeUndefined()
    f.version(1, 0)
    expect(versionPeerHeader(f.read, f.size)).toBeUndefined()
  })

  it('requires two independently readable agreeing format copies', () => {
    const f = fixture()
    f.version(1, versionBits(13) ^ 7)
    f.format(1, formatBits('Q', 7))
    expect(versionPeerHeader(f.read, f.size)).toBeUndefined()
    f.format(1, 0)
    expect(versionPeerHeader(f.read, f.size)).toBeUndefined()
    f.format(0, 0)
    f.format(1, formatBits('M', 3))
    expect(versionPeerHeader(f.read, f.size)).toBeUndefined()
  })

  it('rejects invalid or version-block-free sizes before sampling', () => {
    const read = () => { throw new Error('Invalid size must not sample') }
    for (const size of [-1, 0, 41, 46, 181, Number.NaN, Number.POSITIVE_INFINITY])
      expect(versionPeerHeader(read, size)).toBeUndefined()
  })
})
