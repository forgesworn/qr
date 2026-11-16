import { expect, it } from 'vitest'
import { penalty } from '../src/encode.js'
import { referencePenalty } from './penalty-reference.js'

it('matches literal scoring on random, uniform and periodic grids of every version', () => {
  let seed = 42
  for (let version = 1; version <= 40; version++) {
    const size = 17 + 4 * version
    for (let kind = 0; kind < 6; kind++) {
      const modules = Uint8Array.from({ length: size * size }, (_, i) => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return kind < 2 ? kind : kind === 2 ? i % 2 : kind === 3 ? Math.floor(i / size) % 2 : seed >>> (kind === 4 ? 31 : 30) & 1
      })
      const exact = referencePenalty(modules, size)
      expect(penalty(modules, size)).toBe(exact)
      expect(penalty(modules, size, exact + 1)).toBe(exact)
      for (const limit of [0, Math.floor(exact / 2), exact]) {
        const bounded = penalty(modules, size, limit)
        expect(bounded).toBeGreaterThanOrEqual(limit)
        expect(bounded).toBeLessThanOrEqual(exact)
      }
    }
  }
})

it('scores finder-like cores once with either or both complete quiet runs, at every edge', () => {
  const size = 21
  for (const pattern of ['1011101', '00001011101', '10111010000', '000010111010000', '100010111010001']) {
    for (let offset = 0; offset <= size - pattern.length; offset++) {
      for (const vertical of [false, true]) {
        const modules = new Uint8Array(size * size).fill(1)
        for (let i = 0; i < pattern.length; i++) {
          modules[vertical ? (offset + i) * size + 10 : 10 * size + offset + i] = Number(pattern[i])
        }
        expect(penalty(modules, size)).toBe(referencePenalty(modules, size))
      }
    }
  }
})
