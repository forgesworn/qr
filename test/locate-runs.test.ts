import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { binarise } from '../src/binarise.js'
import { edgesOf, findFinders, finderTriples, locate, type Work } from '../src/locate.js'
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

describe('row edges', () => {
  it('matches adjacent bytes across word tails, offsets and cached row order', () => {
    let seed = 0x2473a6bf
    for (let width = 1; width <= 257; width++) for (const offset of [0, 1, 3, 7]) for (const pattern of ['bytes', 'binary', 'stripes'] as const) {
      const height = 4
      const backing = new Uint8Array(offset + width * height + 5)
      for (let i = 0; i < backing.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        backing[i] = pattern === 'bytes' ? seed >>> 24 : pattern === 'binary' ? seed >>> 31 : i % 2 ? 255 : 0
      }
      const data = backing.subarray(offset, offset + width * height)
      const edges = edgesOf({ data, width, height })
      for (const y of [3, 0, 2, 3, 1, 0]) {
        const expected: number[] = []
        for (let x = 1; x < width; x++) if (data[y * width + x] !== data[y * width + x - 1]) expected.push(x)
        const row = edges.row(y)
        expect([...row], `width ${width}, offset ${offset}, ${pattern}, row ${y}`).toEqual(expected)
        expect(edges.row(y)).toBe(row)
      }
    }
  })
})
