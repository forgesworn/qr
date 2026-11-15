import { describe, expect, it } from 'vitest'
import { encode, isDark, QrCapacityError, toSvg } from '../src/index.js'
import { utf8 } from '../src/encode.js'

describe('encode', () => {
  it('chooses the smallest version and the most compact mode', () => {
    expect(encode('01234567')).toMatchObject({ version: 1, mode: 'numeric' })
    expect(encode('HELLO WORLD')).toMatchObject({ version: 1, mode: 'alphanumeric' })
    expect(encode('hello world')).toMatchObject({ version: 1, mode: 'byte' })
    expect(encode('')).toMatchObject({ version: 1, mode: 'byte' })
  })

  it('defaults to level M and honours minVersion', () => {
    expect(encode('a').ecc).toBe('M')
    expect(encode('a', { minVersion: 5 }).version).toBe(5)
    expect(encode('A', { version: 10, minVersion: 10 }).version).toBe(10)
  })

  it('rejects a fixed version below minVersion', () => {
    expect(() => encode('A', { version: 5, minVersion: 10 })).toThrow(RangeError)
    expect(() => encode('A', { version: 5, minVersion: 10 })).not.toThrow(QrCapacityError)
  })

  it('treats everything outside the symbol as light', () => {
    const qr = encode('a', { version: 2 })
    expect(qr.modules[qr.size]).toBe(1) // (0, 1) is in the top-left finder
    for (const [x, y] of [[qr.size, 0], [-1, 0], [0, -1], [0, qr.size], [qr.size, qr.size - 1], [0.5, 0], [0, 0.5], [NaN, 0], [0, Infinity]]) {
      expect(isDark(qr, x!, y!)).toBe(false)
    }
  })

  it('draws the three finders and the dark module', () => {
    const qr = encode('a', { version: 2 })
    for (const [x, y] of [[0, 0], [qr.size - 7, 0], [0, qr.size - 7]] as const) {
      expect(isDark(qr, x, y)).toBe(true)
      expect(isDark(qr, x + 3, y + 3)).toBe(true)
      expect(isDark(qr, x + 1, y + 1)).toBe(false)
    }
    expect(isDark(qr, 8, qr.size - 8)).toBe(true)
  })

  it('rejects data that does not fit', () => {
    expect(() => encode('a'.repeat(3000), { ecc: 'H' })).toThrow(QrCapacityError)
    expect(() => encode('a'.repeat(20), { version: 1, ecc: 'H' })).toThrow(QrCapacityError)
    expect(encode('a'.repeat(2953), { ecc: 'L' }).version).toBe(40)
    expect(() => encode('a'.repeat(2954), { ecc: 'L' })).toThrow(QrCapacityError)
  })

  it('rejects bad options', () => {
    expect(() => encode('a', { version: 0 })).toThrow(RangeError)
    expect(() => encode('a', { version: 41 })).toThrow(RangeError)
    expect(() => encode('a', { mask: 8 })).toThrow(RangeError)
    expect(() => encode('a', { mode: 'numeric' })).toThrow(RangeError)
    expect(() => encode('abc', { mode: 'alphanumeric' })).toThrow(RangeError)
    expect(() => encode(new Uint8Array(1), { mode: 'numeric' })).toThrow(RangeError)
    expect(() => encode('a', { ecc: 'X' as never })).toThrow(RangeError)
  })

  it('can force byte mode for digits', () => {
    expect(encode('123', { mode: 'byte' }).mode).toBe('byte')
  })

  it('encodes UTF-8 as TextEncoder does, lone surrogates included', () => {
    for (const text of ['', 'abc', 'café', '☕', '😀', 'a\ud800b', '\udc00', '\ud83d']) {
      expect([...utf8(text)]).toEqual([...new TextEncoder().encode(text)])
    }
  })
})

describe('toSvg', () => {
  it('draws one path covering exactly the dark modules', () => {
    const qr = encode('hello', { ecc: 'Q' })
    const svg = toSvg(qr, { margin: 2 })
    expect(svg).toContain(`viewBox="0 0 ${qr.size + 4} ${qr.size + 4}"`)
    const d = /<path fill="#000" d="([^"]*)"/.exec(svg)![1]!
    const drawn = new Set<string>()
    for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      for (let i = 0; i < Number(w); i++) drawn.add(`${Number(x) - 2 + i},${Number(y) - 2}`)
    }
    let dark = 0
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (isDark(qr, x, y)) {
          dark++
          expect(drawn.has(`${x},${y}`)).toBe(true)
        }
      }
    }
    expect(drawn.size).toBe(dark)
  })

  it('escapes colours and title, and can omit the background', () => {
    const svg = toSvg(encode('a'), { dark: '"/><script>', light: null, title: 'A & <b>' })
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('<rect')
    expect(svg).toContain('<title>A &#38; &#60;b&#62;</title>')
    expect(svg).toContain('role="img"')
  })

  it('rejects a bad margin', () => {
    expect(() => toSvg(encode('a'), { margin: -1 })).toThrow(RangeError)
    expect(() => toSvg(encode('a'), { margin: 1.5 })).toThrow(RangeError)
  })
})
