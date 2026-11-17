import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { starvedCurvaturePicture } from './starved-curvature-fixture.js'

describe('terminal curved-map recovery', () => {
  for (const index of [32, 84, 89] as const) {
    it(`recovers retained map ${index} with one fifth attempt`, () => {
      const { image, text, version, mirrored, inverted } = starvedCurvaturePicture(index)
      const before = image.data.slice()
      const work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
      const result = decodeCounted(image, {}, work)
      expect(result?.text).toBe(text)
      expect(result?.bytes).toEqual(new TextEncoder().encode(text))
      expect(result?.version).toBe(version)
      expect(result?.mirrored).toBe(mirrored)
      expect(result?.inverted).toBe(inverted)
      expect(work.second).toBe(5)
      // The terminal retry uses an existing map; these baseline map counts stay fixed.
      expect(work.maps).toBe({ 32: 393, 84: 388, 89: 357 }[index])
      expect(work.probed).toBeLessThanOrEqual(7_187_500)
      expect(image.data).toEqual(before)
    })
  }
})
