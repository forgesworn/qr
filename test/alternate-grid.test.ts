import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { type Work } from '../src/locate.js'
import { alternateGridPicture } from './alternate-grid-fixture.js'

describe('alternate reading of an existing refined grid', () => {
  it('recovers the mirrored Q hypothesis without changing the pixels', () => {
    const f = alternateGridPicture(), before = f.image.data.slice()
    const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    const result = decodeCounted(f.image, {}, work)
    expect(result).toBeDefined()
    expect(result?.text).toBe(f.text)
    expect(result?.bytes).toEqual(new TextEncoder().encode(f.text))
    expect(result?.version).toBe(f.version)
    expect(result?.ecc).toBe(f.ecc)
    expect(result?.mirrored).toBe(true)
    expect(result?.inverted).toBe(false)
    expect(work.second).toBeLessThanOrEqual(8)
    expect(work.maps).toBeLessThanOrEqual(720)
    expect(work.probed).toBeLessThanOrEqual(11_500_000)
    expect(f.image.data).toEqual(before)
  })
})
