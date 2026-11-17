import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { ordinaryCurvaturePicture } from './ordinary-curvature-fixture.js'

// Each own-encoder fixture fails on 0.3.8 and recovers through the final retry.
describe('terminal late refinement after an ordinary attempt', () => {
  for (const index of [73, 79, 88] as const) {
    it(`recovers curved picture ${index} without changing its pixels`, () => {
      const { image, text, version, ecc, mirrored, inverted } = ordinaryCurvaturePicture(index)
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
      expect(work.second).toBeLessThanOrEqual(7)
      expect(work.probed).toBeLessThanOrEqual(10_062_500)
      expect(image.data).toEqual(before)
      // These exhaust the original four and the unattempted-map retry first.
      expect(work.second).toBe(6)
    })
  }
})
