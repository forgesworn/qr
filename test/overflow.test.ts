import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { FORMAT_COORDS } from '../src/encode.js'
import { type Work } from '../src/locate.js'
import { photograph } from './photo.js'
import { overflowFixture, overflowModules, overflowPicture } from './overflow-fixture.js'

describe('recovery beyond the first six finder triples', () => {
  it('reads the frozen perspective frame with exact bytes and bounded work', () => {
    const image = overflowPicture(), before = image.data.slice()
    const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    const result = decodeCounted(image, {}, work)
    expect(result?.text).toBe(overflowFixture.expectedText)
    expect(Buffer.from(result!.bytes).toString('hex')).toBe(overflowFixture.expectedUtf8Hex)
    expect(result?.version).toBe(40)
    expect(work.maps).toBeLessThanOrEqual(720)
    expect(work.second).toBeLessThanOrEqual(4)
    expect(image.data).toEqual(before)
  })

  it('rejects the same data after both format copies are erased', () => {
    const modules = overflowModules(), size = overflowFixture.size
    for (let i = 0; i < 15; i++) {
      const [x, y] = FORMAT_COORDS[i]!
      modules[y * size + x] = 0
      modules[(i < 8 ? 8 : size - 7 + i - 8) * size + (i < 8 ? size - 1 - i : 8)] = 0
    }
    expect(decodeCounted(photograph(modules, size, overflowFixture.shot))).toBeUndefined()
  })
})
