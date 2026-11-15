// A version 40 symbol under a lens whose finders' modules look small, so its
// size estimate runs past 177: the search tries the retries of 177 or less
// and reads it. The Kotlin port draws the same frames (OverTest.kt). Every
// payload is made up.
import { describe, expect, it } from 'vitest'
import { binarise, toLuminance } from '../src/binarise.js'
import { decodeCounted } from '../src/decode.js'
import { encode } from '../src/encode.js'
import { estimateSize, finderTriples, findFinders, type Work } from '../src/locate.js'
import { bent } from './photo.js'

const counter = (): Work => ({ steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0 })

describe('size estimate past 177', () => {
  it('reads version 40 symbols from the retries below the estimate', () => {
    for (const k of [0.01, 0.03]) {
      const text = 'https://example.com/e/' + 'x'.repeat(30)
      const qr = encode(text, { ecc: 'M', version: 40 })
      const frame = bent(qr.modules, qr.size, 4, k)
      const image = binarise(toLuminance(frame.data, frame.width, frame.height, 1, frame.width))
      const triple = finderTriples(image, findFinders(image, 0.5))[0]!
      expect(estimateSize(image, triple)).toBe(181)
      const work = counter()
      const got = decodeCounted(frame, {}, work)
      expect(got?.text).toBe(text)
      expect(got?.version).toBe(40)
      expect(work.maps).toBeLessThanOrEqual(4 * 6 * 5 * 6)
      expect(work.second).toBeLessThanOrEqual(4)
    }
  })
})
