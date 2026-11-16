import { describe, expect, it } from 'vitest'
import { agreedVersion, readVersion } from '../src/symbol.js'
import { FORMAT_COORDS, versionBits } from '../src/encode.js'
import { decodeCounted } from '../src/decode.js'
import { type Work } from '../src/locate.js'
import { photograph } from './photo.js'
import { versionHintFixture, versionHintModules, versionHintPicture } from './version-hint-fixture.js'

// Independent construction of the two 18-bit blocks, without a complete symbol.
function versionCopies(first: number, second: number, damage = 0) {
  const size = 173
  const modules = new Uint8Array(size * size)
  for (let k = 0; k < 18; k++) {
    const i = Math.floor(k / 3), j = k % 3
    modules[(size - 11 + j) * size + i] = ((versionBits(first) ^ damage) >>> k) & 1
    modules[i * size + size - 11 + j] = (versionBits(second) >>> k) & 1
  }
  return { size, read: (x: number, y: number) => modules[y * size + x] === 1 }
}

describe('independent version evidence', () => {
  it('requires both copies to decode to the same version', () => {
    for (let version = 7; version <= 40; version++) {
      for (const damage of [0, 1, 3, 7]) {
        const { size, read } = versionCopies(version, version, damage)
        expect(agreedVersion(read, size)).toBe(version)
      }
      const damaged = versionCopies(version, version, 15)
      expect(agreedVersion(damaged.read, damaged.size)).toBeUndefined()
      // Ordinary symbol reading still accepts one valid copy.
      expect(readVersion(damaged.read, damaged.size)).toBe(version)
    }
    const disagreement = versionCopies(7, 40)
    expect(agreedVersion(disagreement.read, disagreement.size)).toBeUndefined()
    expect(agreedVersion(() => { throw new Error('small grids have no version blocks') }, 41)).toBeUndefined()
  })

  it('recovers the frozen version-40 blur photograph without increasing frame caps', () => {
    const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    const result = decodeCounted(versionHintPicture(), {}, work)
    expect(result?.text).toBe(versionHintFixture.expectedText)
    expect(Buffer.from(result!.bytes).toString('hex')).toBe(versionHintFixture.expectedUtf8Hex)
    expect(result?.version).toBe(40)
    expect(work.second).toBeGreaterThan(0)
    expect(work.maps).toBeLessThanOrEqual(720)
    expect(work.second).toBeLessThanOrEqual(4)
  })

  it('does not recover a valid data grid after both format copies are erased', () => {
    const modules = versionHintModules(), size = versionHintFixture.size
    for (let i = 0; i < 15; i++) {
      const [x, y] = FORMAT_COORDS[i]!
      modules[y * size + x] = 0
      modules[(i < 8 ? 8 : size - 7 + i - 8) * size + (i < 8 ? size - 1 - i : 8)] = 0
    }
    expect(decodeCounted(photograph(modules, size, versionHintFixture.shot))).toBeUndefined()
  })
})
