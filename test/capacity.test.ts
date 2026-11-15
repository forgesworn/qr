import { describe, expect, it } from 'vitest'
import { encode, QrCapacityError, type ErrorCorrection, type Mode } from '../src/index.js'
import { blocksFor, COUNT_BITS, countBand } from '../src/encode.js'

describe('capacity', () => {
  it('still encodes the largest input of each kind at version 40-L', () => {
    expect(encode('7'.repeat(7089), { ecc: 'L' })).toMatchObject({ version: 40, mode: 'numeric' })
    expect(encode('A'.repeat(4296), { ecc: 'L' })).toMatchObject({ version: 40, mode: 'alphanumeric' })
    expect(encode(new Uint8Array(2953), { ecc: 'L' })).toMatchObject({ version: 40, mode: 'byte' })
    expect(encode('a'.repeat(2953), { ecc: 'L' })).toMatchObject({ version: 40, mode: 'byte' })
  })

  it('refuses input one past the largest with the usual capacity error', () => {
    for (const data of ['7'.repeat(7090), 'A'.repeat(4297), new Uint8Array(2954), 'a'.repeat(2954)]) {
      expect(() => encode(data, { ecc: 'L' })).toThrow(QrCapacityError)
      expect(() => encode(data, { ecc: 'L' })).toThrow('Data does not fit any version at level L')
    }
  })

  it('refuses huge input with QrCapacityError, whatever the form', () => {
    const huge = 'a'.repeat(50_000_000)
    expect(() => encode(new Uint8Array(10_000_000))).toThrow(QrCapacityError)
    expect(() => encode(huge)).toThrow(QrCapacityError)
    expect(() => encode(huge, { mode: 'byte' })).toThrow(QrCapacityError)
    expect(() => encode('7'.repeat(50_000_000), { mode: 'numeric' })).toThrow(QrCapacityError)
    expect(() => encode('A'.repeat(50_000_000), { mode: 'alphanumeric' })).toThrow(QrCapacityError)
    expect(() => encode('7'.repeat(50_000_000))).toThrow(QrCapacityError)
    expect(() => encode('\u{1F600}'.repeat(10_000_000))).toThrow(QrCapacityError)
    expect(() => encode(new Uint8Array(10_000_000), { version: 40, ecc: 'H' })).toThrow(QrCapacityError)
  })

  it('names the fixed version when one was asked for', () => {
    expect(() => encode(new Uint8Array(10_000_000), { version: 12 })).toThrow('Data does not fit version 12 at level M')
    expect(() => encode('a'.repeat(50_000_000), { version: 3, ecc: 'Q', mode: 'byte' })).toThrow(
      'Data does not fit version 3 at level Q',
    )
  })

  it('reports an argument error before a capacity error', () => {
    expect(() => encode('a'.repeat(50_000_000), { mode: 'bogus' as Mode })).toThrow('Unknown mode: bogus')
    expect(() => encode(new Uint8Array(10_000_000), { mode: 'numeric' })).toThrow('Bytes can only be encoded in byte mode')
    expect(() => encode(new Uint8Array(10_000_000), { mode: 'numeric' })).not.toThrow(QrCapacityError)
  })

  it('checks length before content for a named mode', () => {
    expect(() => encode('x'.repeat(100), { mode: 'numeric', version: 1 })).toThrow(QrCapacityError)
    expect(() => encode('x'.repeat(100), { mode: 'alphanumeric', version: 1 })).toThrow(QrCapacityError)
    expect(() => encode('x', { mode: 'numeric' })).toThrow(RangeError)
    expect(() => encode('x', { mode: 'numeric' })).not.toThrow(QrCapacityError)
  })

  it('never refuses what fits: the exact maximum of each mode encodes at sampled versions and levels', () => {
    const exact = (mode: Mode, capacityBits: number, version: number): number => {
      const header = 4 + COUNT_BITS[mode][countBand(version)]
      let n = 0
      const cost = (k: number) =>
        mode === 'byte' ? 8 * k : mode === 'numeric' ? 10 * Math.floor(k / 3) + [0, 4, 7][k % 3]! : 11 * Math.floor(k / 2) + 6 * (k % 2)
      while (header + cost(n + 1) <= capacityBits) n++
      return n
    }
    for (const ecc of ['L', 'M', 'Q', 'H'] as ErrorCorrection[]) {
      for (const version of [1, 2, 9, 10, 26, 27, 39, 40]) {
        const [, g1, d1, g2] = blocksFor(version, ecc)
        const bits = (g1 * d1 + g2 * (d1 + 1)) * 8
        for (const [mode, ch] of [['numeric', '7'], ['alphanumeric', 'A'], ['byte', 'a']] as const) {
          const n = exact(mode, bits, version)
          const got = encode(ch.repeat(n), { version, ecc, mode })
          expect(got.version, `${version}-${ecc} ${mode} ${n}`).toBe(version)
          expect(() => encode(ch.repeat(n + 1), { version, ecc, mode }), `${version}-${ecc} ${mode} ${n + 1}`).toThrow(QrCapacityError)
        }
      }
    }
  })
})
