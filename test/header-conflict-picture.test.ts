import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { headerConflictPicture } from './header-conflict-fixture.js'

// Each own-encoder fixture fails on 0.3.7 and recovers through the final retry.
describe('terminal conflicting-format recovery', () => {
  for (const index of [32, 42, 72, 76] as const) {
    it(`recovers curved picture ${index} without changing its pixels`, () => {
      const { image, text, version, ecc, mirrored, inverted } = headerConflictPicture(index)
      const before = image.data.slice()
      const work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
      const result = decodeCounted(image, {}, work)
      expect(result?.text).toBe(text)
      expect(result?.bytes).toEqual(new TextEncoder().encode(text))
      expect(result?.version).toBe(version)
      expect(result?.ecc).toBe(ecc)
      expect(result?.mirrored).toBe(mirrored)
      expect(result?.inverted).toBe(inverted)
      expect(work.maps).toBeLessThanOrEqual(720)
      expect(work.second).toBeLessThanOrEqual(6)
      expect(work.probed).toBeLessThanOrEqual(8_625_000)
      expect(image.data).toEqual(before)
      // The first three need only the new attempt; the last exhausts all six.
      expect(work.second).toBe(index === 76 ? 6 : 1)
    })
  }
})
