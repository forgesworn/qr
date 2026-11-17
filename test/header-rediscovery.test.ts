import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { type Work } from '../src/locate.js'
import { headerRediscoveryPicture } from './header-rediscovery-fixture.js'

describe('strict header rediscovery on an existing refined grid', () => {
  it.each([6, 122] as const)('recovers the expected payload and orientation for case %i', index => {
    const f = headerRediscoveryPicture(index), before = f.image.data.slice()
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
