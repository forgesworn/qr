import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { meshReadingPicture } from './mesh-reading-fixture.js'

describe('deferred mesh reading', () => {
  for (const index of [16, 87] as const) {
    it(`recovers the ${index === 16 ? 'reduced-size' : 'inverted'} mesh with its public coordinates and polarity`, () => {
      const { image, text, version, inverted } = meshReadingPicture(index)
      const before = image.data.slice()
      const work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
      const result = decodeCounted(image, {}, work)
      expect(result?.text).toBe(text)
      expect(result?.bytes).toEqual(new TextEncoder().encode(text))
      expect(result?.version).toBe(version)
      expect(result?.inverted).toBe(inverted)
      expect(result?.mirrored).toBe(false)
      if (index === 16) {
        expect(result?.location.topLeft).toEqual({ x: 47, y: 48 })
        expect(result?.location.topRight).toEqual({ x: 298, y: 48 })
        expect(result?.location.bottomLeft).toEqual({ x: 48, y: 298 })
      }
      expect(work.meshes).toBeGreaterThan(0)
      expect(work.second).toBeLessThanOrEqual(4)
      expect(work.maps).toBeLessThanOrEqual(720)
      expect(work.probed).toBeLessThanOrEqual(5_750_000)
      expect(image.data).toEqual(before)
    })
  }
})
