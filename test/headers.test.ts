import { describe, expect, it } from 'vitest'
import { encode } from '../src/index.js'
import { readSymbol } from '../src/symbol.js'
import { seg, symbol } from './builder.js'

const enc = new TextEncoder()
const GS = '\u001d'

// Version 2, level L: count lengths of the first band.
function read(bits: number[]) {
  const { modules, size } = symbol(bits, 2, 'L', 1)
  return readSymbol((x, y) => modules[y * size + x] === 1, size)
}

describe('structured append and FNC1', () => {
  it('builds what encode() builds, so the helper is sound', () => {
    const qr = encode('hello world', { version: 2, ecc: 'L', mask: 3 })
    expect(Array.from(symbol(seg.bytes(enc.encode('hello world'), 8), 2, 'L', 3).modules)).toEqual(Array.from(qr.modules))
  })

  it('leaves the optional fields out of an ordinary symbol', () => {
    const got = read(seg.bytes(enc.encode('plain'), 8))!
    expect(got).not.toHaveProperty('structuredAppend')
    expect(got).not.toHaveProperty('fnc1')
  })

  it("reports a structured-append header and keeps this symbol's part only", () => {
    const got = read([...seg.structuredAppend(1, 3, 0x5a), ...seg.bytes(enc.encode('second part'), 8)])!
    expect(got.structuredAppend).toEqual({ index: 1, total: 3, parity: 0x5a })
    expect(got.text).toBe('second part')
    expect(got).not.toHaveProperty('fnc1')
    const last = read([...seg.structuredAppend(15, 16, 0xff), ...seg.bytes(enc.encode('x'), 8)])!
    expect(last.structuredAppend).toEqual({ index: 15, total: 16, parity: 0xff })
  })

  it('reads FNC1 in first position: % is the group separator, %% is %', () => {
    const got = read([...seg.fncFirst(), ...seg.numeric('0109506000134352', 10), ...seg.alnum('10ABC123%21XYZ', 9), ...seg.alnum('A%%B%', 9)])!
    expect(got.fnc1).toEqual({ position: 'first' })
    expect(got).not.toHaveProperty('structuredAppend')
    expect(got.text).toBe(`010950600013435210ABC123${GS}21XYZA%B${GS}`)
    // bytes holds the same: U+001D for a lone %, one % for a pair.
    expect(Array.from(got.bytes)).toEqual(Array.from(enc.encode(got.text)))
  })

  it('applies the % rule within a segment, to alphanumeric segments only, and only after FNC1', () => {
    expect(read([...seg.alnum('A%B', 9), ...seg.fncFirst(), ...seg.alnum('C%D', 9)])!.text).toBe(`A%BC${GS}D`)
    expect(read([...seg.fncFirst(), ...seg.alnum('A%', 9), ...seg.alnum('%B', 9)])!.text).toBe(`A${GS}${GS}B`)
    expect(read([...seg.fncFirst(), ...seg.bytes(enc.encode('a%b%%'), 8)])!.text).toBe('a%b%%')
    const plain = read(seg.alnum('A%%B', 9))!
    expect(plain.text).toBe('A%%B')
    expect(plain).not.toHaveProperty('fnc1')
  })

  it('reads FNC1 in second position with its application indicator', () => {
    const two = read([...seg.fncSecond(37), ...seg.alnum('AA1234%BBB', 9)])!
    expect(two.fnc1).toEqual({ position: 'second', applicationIndicator: '37' })
    expect(two.text).toBe(`AA1234${GS}BBB`)
    const a = (v: number) => read([...seg.fncSecond(v), ...seg.bytes([0x41], 8)])
    expect(a(5)!.fnc1?.applicationIndicator).toBe('05')
    expect(a(99)!.fnc1?.applicationIndicator).toBe('99')
    expect(a(165)!.fnc1?.applicationIndicator).toBe('A')
    expect(a(222)!.fnc1?.applicationIndicator).toBe('z')
    for (const bad of [100, 164, 191, 196, 223, 255]) expect(a(bad), String(bad)).toBeUndefined()
  })

  it('reads both headers together', () => {
    const got = read([...seg.structuredAppend(0, 2, 7), ...seg.fncFirst(), ...seg.alnum('1A%2B', 9)])!
    expect(got.structuredAppend).toEqual({ index: 0, total: 2, parity: 7 })
    expect(got.fnc1).toEqual({ position: 'first' })
    expect(got.text).toBe(`1A${GS}2B`)
  })
})
