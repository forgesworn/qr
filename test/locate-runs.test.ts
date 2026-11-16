import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { binarise } from '../src/binarise.js'
import { findFinders, finderTriples, locate, type Work } from '../src/locate.js'
import { readPng } from './png.js'

const finders = [
  { x: 54.5, y: 54.5, moduleSize: 3, count: 9 },
  { x: 144.5, y: 54.5, moduleSize: 3, count: 9 },
  { x: 54.5, y: 144.5, moduleSize: 3, count: 9 },
]

describe('finder and alignment row runs', () => {
  it.each([
    { cut: 0, expectedFinders: finders, steps: 3084, compared: 24, scanned: 676, alignment: { x: 135.66666666666666, y: 135.5 } },
    { cut: 40, expectedFinders: finders, steps: 3081, compared: 24, scanned: 676, alignment: { x: 135.66666666666666, y: 135.5 } },
    { cut: 50, expectedFinders: finders.slice(0, 1), steps: 1805, compared: 8, scanned: 0, alignment: undefined },
  ])('keeps candidates and work at image crop $cut', ({ cut, expectedFinders, steps, compared, scanned, alignment }) => {
    const bits = binarise(readPng(readFileSync('vectors/decode-frames/frame-01.png')))
    const width = bits.width - cut, height = bits.height - cut
    const data = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) data.set(bits.data.subarray(y * bits.width, y * bits.width + width), y * width)
    const image = { width, height, data }
    const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0 }
    const found = findFinders(image, 0.5, work)
    expect(found).toEqual(expectedFinders)
    const triples = finderTriples(image, found)
    const maps = triples.length ? locate(image, triples[0]!, undefined, work) : []
    expect(maps[0]?.alignment).toEqual(alignment)
    expect(maps.map((map) => map.size)).toEqual(alignment ? [37, 37] : [])
    expect(work).toEqual({ steps, compared, scanned, maps: 0, second: 0, meshes: 0, probed: 0 })
  })
})
