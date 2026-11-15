import { describe, expect, it } from 'vitest'
import { looksShiftJis } from '../src/text.js'
import { readSymbol } from '../src/symbol.js'
import { seg, symbol } from './builder.js'

// Version 2, level L: count lengths of the first band.
function text(bytes: number[]): string {
  const { modules, size } = symbol(seg.bytes(Uint8Array.from(bytes), 8), 2, 'L', 1)
  return readSymbol((x, y) => modules[y * size + x] === 1, size)!.text
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))

describe('byte data with no ECI that is not UTF-8', () => {
  it('reads half-width katakana as Shift_JIS', () => {
    // Half-width "design" in katakana, then QR.
    expect(text([0xc3, 0xde, 0xbb, 0xde, 0xb2, 0xdd, ...ascii('QR')])).toBe('ﾃﾞｻﾞｲﾝQR')
  })

  it('reads kanji, short and with ASCII around it', () => {
    expect(text([0x93, 0x8c, 0x8b, 0x9e])).toBe('東京')
    expect(text([...ascii('ID:'), 0x93, 0xfa, 0x96, 0x7b, ...ascii('1')])).toBe('ID:日本1')
    expect(text([0x82, 0xa0])).toBe('あ')
  })

  it('leaves ordinary Latin-1 text alone', () => {
    expect(text([...ascii('caf'), 0xe9])).toBe('café')
    expect(text([0xe9])).toBe('é')
    expect(text([0xe9, 0x6c, 0xe8, 0x76, 0x65])).toBe('élève')
    expect(text([...ascii('Z'), 0xfc, ...ascii('rich')])).toBe('Zürich')
    expect(text([...ascii('na'), 0xef, ...ascii('ve')])).toBe('naïve')
    expect(text([...ascii('gar'), 0xe7, ...ascii('on')])).toBe('garçon')
    expect(text([...ascii('A'), 0xf1, ...ascii('o')])).toBe('Año')
    expect(text([...ascii('a la carte'), 0xe0])).toBe('a la carteà')
  })

  it('leaves currency signs and single symbols alone', () => {
    expect(text([0xa5, ...ascii('100')])).toBe('¥100')
    expect(text([0xa3, ...ascii('9.99')])).toBe('£9.99')
    expect(text([0xa3, ...ascii('5 '), 0xa5, ...ascii('6')])).toBe('£5 ¥6')
    expect(text([0xc7, ...ascii('a va')])).toBe('Ça va')
  })

  it('prefers valid UTF-8 and leaves bytes alone', () => {
    expect(text([0xc3, 0xa9])).toBe('é')
    const { modules, size } = symbol(seg.bytes(Uint8Array.of(0xc3, 0xde, 0xbb, 0xde, 0xb2, 0xdd), 8), 2, 'L', 1)
    expect(Array.from(readSymbol((x, y) => modules[y * size + x] === 1, size)!.bytes)).toEqual([0xc3, 0xde, 0xbb, 0xde, 0xb2, 0xdd])
  })

  it('is not applied under an ECI', () => {
    const { modules, size } = symbol([...seg.eci(3), ...seg.bytes(Uint8Array.of(0x93, 0x8c, 0x8b, 0x9e), 8)], 2, 'L', 1)
    expect(readSymbol((x, y) => modules[y * size + x] === 1, size)!.text).toBe('\u0093\u008c\u008b\u009e')
  })

  it('the rule, byte by byte', () => {
    const yes = (b: number[]) => looksShiftJis(Uint8Array.from(b))
    expect(yes([0xb1, 0xb2, 0xb3])).toBe(true) // three katakana
    expect(yes([0xb1, 0xb2])).toBe(false) // two are ambiguous: Latin-1
    expect(yes([0xe0, 0x40, 0xe1, 0x41, 0xe2, 0x42])).toBe(true) // three double-byte characters
    expect(yes([0xe0, 0x40, 0xe1, 0x41])).toBe(false)
    expect(yes([0x81, 0x40])).toBe(true) // lead in 0x81 to 0x9F
    expect(yes([0x81, 0x40, 0xe9])).toBe(false) // a lead with no trail rules it out
    expect(yes([0x81, 0x7f])).toBe(false) // 0x7F is not a trail
    expect(yes([0x80])).toBe(false)
    expect(yes([0xa0, 0xb1, 0xb2, 0xb3])).toBe(false)
    expect(yes([0xb1, 0xb2, 0xb3, 0xf0])).toBe(false)
    expect(yes([0xb1, 0xb2, 0x41, 0xb3])).toBe(false) // runs are broken by ASCII
  })
})
