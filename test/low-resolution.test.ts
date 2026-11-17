import { describe, expect, it } from 'vitest'
import { enlarge } from '../src/binarise.js'
import { decodeCounted } from '../src/decode.js'
import { type Work } from '../src/locate.js'
import { lowResolutionPicture, type LowResolutionIndex } from './low-resolution-fixture.js'

const cases: LowResolutionIndex[] = [10, 46, 51, 92, 94]

describe('terminal low-resolution recovery', () => {
  it('enlarges with pixel-centre bilinear interpolation', () => {
    const image = { data: Uint8Array.from([0, 100, 200, 255]), width: 2, height: 2 }
    const larger = enlarge(image, 2)
    expect([larger.width, larger.height]).toEqual([4, 4])
    expect([...larger.data]).toEqual([
      0, 25, 75, 100,
      50, 72, 117, 139,
      150, 167, 200, 216,
      200, 214, 241, 255,
    ])
  })

  it.each(cases)('recovers the exact payload of independent case %i without changing legacy work', (index) => {
    const f = lowResolutionPicture(index)
    const before = f.image.data.slice()
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

  it('continues to honour the requested polarity', () => {
    const f = lowResolutionPicture(51)
    expect(decodeCounted(f.image, { inversion: 'normal' })).toBeUndefined()
  })
})
