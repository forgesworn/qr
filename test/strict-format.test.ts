import { describe, expect, it } from 'vitest'
import { decodeModules } from '../src/decode.js'
import { encode, FORMAT_COORDS } from '../src/encode.js'
import { agreement, agreementRead } from '../src/refine.js'

function flipSecond(modules: Uint8Array, size: number, i: number): void {
  const x = i < 8 ? size - 1 - i : 8
  const y = i < 8 ? 8 : size - 7 + i - 8
  modules[y * size + x]! ^= 1
}

function transpose(modules: Uint8Array, size: number): Uint8Array {
  return Uint8Array.from({ length: size * size }, (_, i) => modules[(i % size) * size + Math.floor(i / size)]!)
}

describe('strict format agreement', () => {
  it('agrees through a lazy reader in either orientation with up to two damaged bits', () => {
    for (const version of [1, 7, 12]) {
      const qr = encode('hello', { version })
      for (const errors of [0, 1, 2]) for (const mirrored of [false, true]) {
        let modules: Uint8Array = Uint8Array.from(qr.modules)
        for (let i = 0; i < errors; i++) flipSecond(modules, qr.size, i)
        if (mirrored) modules = transpose(modules, qr.size)
        const sampled = new Set<number>()
        const result = agreementRead((x, y) => {
          sampled.add(y * qr.size + x)
          return modules[y * qr.size + x] === 1
        }, qr.size)
        expect(result).toEqual(agreement(modules, qr.size))
        expect(result).toMatchObject({ mirrored, ecc: qr.ecc, mask: qr.mask, distance: errors })
        expect(decodeModules(modules, qr.size)).toMatchObject({ text: 'hello', mirrored })
        const expected = new Set<number>()
        for (let i = 0; i < FORMAT_COORDS.length; i++) {
          const [x, y] = FORMAT_COORDS[i]!
          const sx = i < 8 ? qr.size - 1 - i : 8
          const sy = i < 8 ? 8 : qr.size - 7 + i - 8
          for (const [a, b] of [[x, y], [y, x], [sx, sy], [sy, sx]] as const) expected.add(b * qr.size + a)
        }
        expect(sampled).toEqual(expected)
      }
    }
  })

  it('finds no agreeing orientation when one copy has three damaged bits', () => {
    for (const version of [1, 7, 12]) {
      const qr = encode('hello', { version })
      let damaged: Uint8Array | undefined
      for (let a = 0; a < 15 && !damaged; a++) for (let b = a + 1; b < 15 && !damaged; b++) for (let c = b + 1; c < 15 && !damaged; c++) {
        const candidate = Uint8Array.from(qr.modules)
        for (const i of [a, b, c]) flipSecond(candidate, qr.size, i)
        if (!agreement(candidate, qr.size)) damaged = candidate
      }
      expect(damaged).toBeDefined()
      for (const mirrored of [false, true]) {
        const modules = mirrored ? transpose(damaged!, qr.size) : damaged!
        expect(agreementRead((x, y) => modules[y * qr.size + x] === 1, qr.size)).toBeUndefined()
        expect(decodeModules(modules, qr.size)).toMatchObject({ text: 'hello', mirrored })
      }
    }
  })
})
