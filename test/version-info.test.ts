import { describe, expect, it } from 'vitest'
import { encode } from '../src/index.js'
import { decodeModules } from '../src/decode.js'
import { versionBits } from '../src/encode.js'
import { readSymbol } from '../src/symbol.js'

/** A small seeded generator (mulberry32), so every run damages the same modules. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Indices of the 18 modules of the bottom-left and top-right version blocks. */
function versionModules(size: number): { bottomLeft: number[]; topRight: number[] } {
  const bottomLeft: number[] = []
  const topRight: number[] = []
  for (let k = 0; k < 18; k++) {
    const i = Math.floor(k / 3)
    const j = k % 3
    bottomLeft.push((size - 11 + j) * size + i)
    topRight.push(i * size + (size - 11 + j))
  }
  return { bottomLeft, topRight }
}

describe('damaged version information', () => {
  for (const version of [7, 10, 40]) {
    it(`reads version ${version} when four bits of each copy are flipped`, () => {
      const text = `v${version}-` + 'HELLO 0123 '.repeat(version)
      const qr = encode(text, { ecc: 'L', version })
      const { bottomLeft, topRight } = versionModules(qr.size)
      const m = qr.modules.slice()
      // Four flips are at least four bits from every version code, so neither copy decodes.
      for (const k of [0, 5, 11, 17]) {
        m[bottomLeft[k]!]! ^= 1
        m[topRight[(k + 3) % 18]!]! ^= 1
      }
      const got = decodeModules(m, qr.size)
      expect(got).toMatchObject({ text, version, mirrored: false })
    })

    it(`reads version ${version} when both copies are blanked`, () => {
      const text = 'blank ' + version
      const qr = encode(text, { ecc: 'M', version })
      const { bottomLeft, topRight } = versionModules(qr.size)
      for (const level of [0, 1]) {
        const m = qr.modules.slice()
        for (const i of [...bottomLeft, ...topRight]) m[i] = level
        expect(decodeModules(m, qr.size), `level ${level}`).toMatchObject({ text, version })
      }
    })
  }

  it('still reads a mirrored symbol with both copies damaged', () => {
    const qr = encode('mirror', { version: 10 })
    const m = new Uint8Array(qr.size * qr.size)
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) m[x * qr.size + y] = qr.modules[y * qr.size + x]!
    for (const i of [...versionModules(qr.size).bottomLeft, ...versionModules(qr.size).topRight]) m[i] = 0
    expect(decodeModules(m, qr.size)).toMatchObject({ text: 'mirror', mirrored: true })
  })

  it('does not change what happens when a copy decodes: a copy naming another version fails', () => {
    const qr = encode('same grid', { version: 11, ecc: 'L' })
    const { bottomLeft, topRight } = versionModules(qr.size)
    const m = qr.modules.slice()
    // Both copies say version 10 on a grid whose size says 11.
    for (const i of [...bottomLeft, ...topRight]) m[i] = 0
    const bits = versionBits(10)
    for (let k = 0; k < 18; k++) {
      m[bottomLeft[k]!] = (bits >> k) & 1
      m[topRight[k]!] = (bits >> k) & 1
    }
    expect(decodeModules(m, qr.size)).toBeUndefined()
  })
})

describe('wrong sizes and heavy damage never give wrong text', () => {
  /** Throwaway text, a third of the way up the version's byte capacity at level M or more. */
  const texts = (n: number, version: number) => ('sample ' + n.toString(36) + ' ' + 'ABCDE-12345 '.repeat(version * 3)).slice(0, 20 + version * 4)

  it('a few hundred symbols, read at the wrong size or with heavy damage, give nothing or the exact bytes', () => {
    const rand = prng(20260101)
    let read = 0
    let refused = 0
    for (let n = 0; n < 300; n++) {
      const version = 7 + Math.floor(rand() * 34)
      const bytes = new TextEncoder().encode(texts(n, version))
      const qr = encode(bytes, { ecc: n % 2 === 0 ? 'L' : 'M', version })
      const size = qr.size
      const at = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && qr.modules[y * size + x] === 1
      const sizes: number[] = []
      for (const d of [-8, -4, 4, 8]) if (size + d >= 21 && size + d <= 177) sizes.push(size + d)
      const checks: { size: number; reader: (x: number, y: number) => boolean }[] = []
      for (const wrong of sizes) {
        // Stretched to fit, as a mislocated sampling grid would.
        checks.push({ size: wrong, reader: (x, y) => at(Math.floor((x * size) / wrong), Math.floor((y * size) / wrong)) })
        // Same module pitch, a larger or smaller frame, corner fixed.
        checks.push({ size: wrong, reader: at })
      }
      // Damage at the right size: a light touch that is correctable, then from 5 per cent to half the symbol.
      for (const rate of [0.003, 0.05, 0.1, 0.2, 0.35, 0.5]) {
        const flips = new Uint8Array(size * size)
        for (let i = 0; i < flips.length; i++) flips[i] = rand() < rate ? 1 : 0
        checks.push({ size, reader: (x, y) => (qr.modules[y * size + x]! ^ flips[y * size + x]!) === 1 })
      }
      for (const { size: s, reader } of checks) {
        const got = readSymbol(reader, s)
        if (got === undefined) {
          refused++
          continue
        }
        read++
        expect(Array.from(got.bytes), `v${version} read at ${s}`).toEqual(Array.from(bytes))
      }
    }
    // The undamaged-size cases at low damage are fixable, the wrong sizes are not: both outcomes occur.
    expect(refused).toBeGreaterThan(1000)
    expect(read).toBeGreaterThan(0)
  })
})
