import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decodeModules } from '../src/index.js'
import { loadWasm, type WasmQr } from '../src/wasm.js'
import { seg, symbol } from './builder.js'

const fixture = JSON.parse(readFileSync(new URL('./charsets.json', import.meta.url), 'utf8')) as {
  kanji: string; hanzi: string; single: Record<string, string>; samples: Record<string, [string, string][]>
}

describe('WASM host character sets', () => {
  let wasm: WasmQr
  beforeAll(async () => { wasm = await loadWasm(readFileSync(new URL('../wasm/qr.wasm', import.meta.url))) })
  afterAll(() => { wasm?.dispose() })
  function read(bits: number[], version = 10) {
    const qr = symbol(bits, version, 'L', 1)
    const found = wasm.decodeModules(qr.modules, qr.size)
    expect(found).toEqual(decodeModules(qr.modules, qr.size))
    return found
  }

  it('reads every kanji value against the pinned text fixture through the complete module reader', () => {
    const characters = [...fixture.kanji]
    for (let start = 0; start < 8192; start += 128) {
      const values = Array.from({ length: 128 }, (_, i) => start + i)
      expect(read(seg.kanji(values, 10))?.text).toBe(characters.slice(start, start + 128).join(''))
    }
  })

  it('reads every valid hanzi value and rejects every empty or out-of-range cell', () => {
    const valid: number[] = [], characters = [...fixture.hanzi]
    for (let value = 0; value < 8192; value++) {
      if (characters[value] === '\0') expect(read(seg.hanzi([value], 8), 2)).toBeUndefined()
      else valid.push(value)
    }
    for (let start = 0; start < valid.length; start += 128) {
      const values = valid.slice(start, start + 128)
      expect(read(seg.hanzi(values, 10))?.text).toBe(values.map(value => characters[value]).join(''))
    }
  })

  it('preserves all single-byte values and multibyte ECI samples', () => {
    for (const eci of Object.keys(fixture.single).map(Number)) {
      read([...seg.eci(eci), ...seg.bytes(Uint8Array.from({ length: 256 }, (_, i) => i), 16)])
    }
    for (const [eci, samples] of Object.entries(fixture.samples)) for (const [hex, text] of samples) {
      expect(read([...seg.eci(Number(eci)), ...seg.bytes(Buffer.from(hex, 'hex'), 16)])?.text).toBe(text)
    }
  })

  it('keeps segment boundaries, ECI changes, implicit Shift_JIS and malformed UTF-8 distinct', () => {
    read([
      ...seg.eci(9), ...seg.bytes([0xc1, 0x41], 16), ...seg.kanji([0x0d9f], 10),
      ...seg.bytes([0xc2], 16), ...seg.hanzi([0x122f], 10),
      ...seg.eci(26), ...seg.bytes([0xc3, 0xa9, 0xff], 16),
      ...seg.eci(900), ...seg.bytes([0x41, 0xc1], 16),
    ])
    for (const bytes of [[0x93, 0x8c, 0x8b, 0x9e], [0xc3, 0xde, 0xbb, 0xde, 0xb2, 0xdd], [0x63, 0x61, 0x66, 0xe9]]) {
      read(seg.bytes(bytes, 16))
    }
    read([...seg.eci(3), ...seg.bytes([0x93, 0x8c, 0x8b, 0x9e], 16)])
  })

  it('releases callback buffers across repeated mixed-text reads and rejected hanzi', () => {
    const valid = symbol([
      ...seg.eci(9), ...seg.bytes([0xc1, 0xc2], 8),
      ...seg.kanji([0x0d9f], 8), ...seg.hanzi([0x122f], 8),
    ], 2, 'L', 1)
    const invalid = symbol(seg.hanzi([9 * 0x60], 8), 2, 'L', 1)
    const round = () => {
      expect(wasm.decodeModules(valid.modules, valid.size)?.text).toBe('ΑΒ点中')
      expect(wasm.decodeModules(invalid.modules, invalid.size)).toBeUndefined()
    }
    for (let i = 0; i < 100; i++) round()
    const warm = wasm.memoryBytes
    for (let i = 0; i < 500; i++) round()
    expect(wasm.memoryBytes).toBe(warm)
  })
})
