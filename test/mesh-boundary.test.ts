import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { meshBoundaryPicture } from './mesh-boundary-fixture.js'

describe('mesh boundary continuation', () => {
  for (const scale of [2, 3] as const) {
    it(`reads a curved sheet at ${scale} pixels per module`, () => {
      const { image, text } = meshBoundaryPicture(scale), before = image.data.slice()
      const work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
      const result = decodeCounted(image, {}, work)
      expect(result?.text).toBe(text)
      expect(result?.bytes).toEqual(new TextEncoder().encode(text))
      expect(result?.version).toBe(34)
      expect(work.meshes).toBeGreaterThan(0)
      expect(work.second).toBeLessThanOrEqual(4)
      expect(work.maps).toBeLessThanOrEqual(720)
      expect(work.probed).toBeLessThanOrEqual(5_750_000)
      expect(image.data).toEqual(before)
    })
  }
})
