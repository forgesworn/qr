import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { type Work } from '../src/locate.js'
import { selectedMeshPicture } from './selected-mesh-fixture.js'

describe('strict rediscovered header on its existing mesh', () => {
  it.each([42, 39] as const)('recovers the expected payload and orientation for case %i', index => {
    const f = selectedMeshPicture(index), before = f.image.data.slice()
    const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    const result = decodeCounted(f.image, {}, work)
    expect(result).toBeDefined()
    expect(result?.text).toBe(f.text)
    expect(result?.bytes).toEqual(new TextEncoder().encode(f.text))
    expect(result?.version).toBe(f.version)
    expect(result?.ecc).toBe(f.ecc)
    expect(result?.mirrored).toBe(f.mirrored)
    expect(result?.inverted).toBe(f.inverted)
    expect(work.second).toBeLessThanOrEqual(8)
    expect(work.maps).toBeLessThanOrEqual(720)
    expect(work.probed).toBeLessThanOrEqual(11_500_000)
    expect(f.image.data).toEqual(before)
  })
})
