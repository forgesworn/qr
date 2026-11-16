import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { decode, decodeModules, encode, QrCapacityError, type DecodeResult, type EncodeOptions, type ErrorCorrection } from '../src/index.js'
import { loadWasm } from '../src/wasm.js'
import { photograph } from './photo.js'
import { readPng } from './png.js'
import { seg, symbol } from './builder.js'

const binary = readFileSync(new URL('../wasm/qr.wasm', import.meta.url))
const point = (p: { x: number; y: number } | undefined) => p ? { x: p.x, y: p.y } : undefined
const publicResult = (r: DecodeResult | undefined) => r && ({ ...r, location: {
  topLeft: point(r.location.topLeft), topRight: point(r.location.topRight),
  bottomLeft: point(r.location.bottomLeft), alignment: point(r.location.alignment),
} })

describe('distributed WebAssembly adapter', () => {
  it('matches complete encoded symbols, including segments, for every encoder vector', async () => {
    const wasm = await loadWasm(binary)
    const { vectors } = JSON.parse(readFileSync(new URL('../vectors/encode-vectors.json', import.meta.url), 'utf8')) as {
      vectors: { id: string; text: string; ecc: ErrorCorrection; eci: boolean; requestedVersion: number | null; requestedMask: number | null }[]
    }
    try {
      for (const v of vectors) {
        const options = { ecc: v.ecc, eci: v.eci, version: v.requestedVersion ?? undefined, mask: v.requestedMask ?? undefined }
        expect(wasm.encode(v.text, options), v.id).toEqual(encode(v.text, options))
      }
      for (const input of ['', '\ufeffhello', 'a\ud800b', new Uint8Array([0, 255, 3]), runInNewContext('new Uint8Array([97,98])') as Uint8Array]) {
        expect(wasm.encode(input, null)).toEqual(encode(input, null))
      }
    } finally { wasm.dispose() }
  })

  it('honours encoder modes, ECI, minimum versions and capacity errors', async () => {
    const wasm = await loadWasm(binary)
    try {
      for (const [data, options] of [
        ['0123456789', { mode: 'numeric', minVersion: 7, mask: 6, ecc: 'H' }],
        ['ABCD:12345', { mode: 'alphanumeric', eci: true }],
        ['é漢字', { mode: 'byte', eci: true, minVersion: 4 }],
        [new Uint8Array([0, 255, 128]), { mode: 'byte', eci: true, ecc: 'L' }],
      ] as [string | Uint8Array, EncodeOptions][]) {
        expect(wasm.encode(data, options)).toEqual(encode(data, options))
      }
      expect(() => wasm.encode('abc', { mode: 'numeric' })).toThrow(RangeError)
      expect(() => wasm.encode('a'.repeat(50), { version: 1, ecc: 'H' })).toThrow(QrCapacityError)
      expect(() => wasm.encode(new Uint8Array([1]), { mode: 'numeric' })).toThrow(RangeError)
    } finally { wasm.dispose() }
  })

  it('matches the complete public result for every conformance frame', async () => {
    const wasm = await loadWasm(binary)
    const { frames } = JSON.parse(readFileSync(new URL('../vectors/conformance.json', import.meta.url), 'utf8')) as { frames: { file: string }[] }
    try {
      for (const { file } of frames) {
        const image = readPng(readFileSync(new URL('../vectors/' + file, import.meta.url)))
        expect(wasm.decode(image), file).toEqual(publicResult(decode(image)))
      }
    } finally { wasm.dispose() }
  })

  it('returns header metadata and makes the character-set limits explicit', async () => {
    const wasm = await loadWasm(binary)
    try {
      for (const bits of [
        [...seg.structuredAppend(0, 2, 19), ...seg.bytes([65, 66], 8)],
        [...seg.fncFirst(), ...seg.alnum('A%B', 9)],
        [...seg.fncSecond(65), ...seg.bytes([65, 66], 8)],
        [...seg.eci(26), ...seg.bytes([0xc3, 0xa9], 8)],
      ]) {
        const qr = symbol(bits, 2, 'M', 0)
        expect(wasm.decodeModules(qr.modules, qr.size)).toEqual(decodeModules(qr.modules, qr.size))
      }
      const kanji = symbol(seg.kanji([0], 8), 2, 'M', 0)
      expect(wasm.decodeModules(kanji.modules, kanji.size)).toMatchObject({ text: '\ufffd', bytes: new Uint8Array([0x81, 0x40]) })
      const hanzi = symbol(seg.hanzi([0], 8), 2, 'M', 0)
      expect(wasm.decodeModules(hanzi.modules, hanzi.size)).toBeUndefined()
    } finally { wasm.dispose() }
  })

  it('preserves outputs and isolates instances across memory growth, reset and disposal', async () => {
    const a = await loadWasm(binary), b = await loadWasm(binary)
    const qr = a.encode('https://example.com/first')
    const before = qr.modules.slice()
    const found = a.decodeModules(qr.modules, qr.size)!
    a.decode({ data: new Uint8Array(1280 * 720).fill(255), width: 1280, height: 720 })
    a.reset()
    expect(a.encode('after reset')).toEqual(encode('after reset'))
    a.dispose()
    a.dispose()
    expect(a.memoryBytes).toBe(0)
    expect(() => a.encode('disposed')).toThrow(/disposed/)
    expect(() => a.reset()).toThrow(/disposed/)
    expect(qr.modules).toEqual(before)
    expect(found.text).toBe('https://example.com/first')
    expect(new TextDecoder().decode(found.bytes)).toBe(found.text)
    expect(b.decodeModules(qr.modules, qr.size)?.text).toBe(found.text)
    b.dispose()
  })

  it('has bounded memory through repeated full reads, grid reads, failures and resets', async () => {
    const wasm = await loadWasm(binary)
    const qr = encode('https://example.com/memory')
    const image = photograph(qr.modules, qr.size, { scale: 3 })
    const round = (i: number) => {
      if (i % 7 === 0) wasm.reset()
      expect(wasm.decode(image)?.text).toBe('https://example.com/memory')
      expect(wasm.decodeModules(qr.modules, qr.size)?.text).toBe('https://example.com/memory')
      expect(() => wasm.encode(new Uint8Array(3000))).toThrow(QrCapacityError)
    }
    try {
      for (let i = 0; i < 200; i++) round(i)
      const warmed = wasm.memoryBytes
      for (let i = 0; i < 1000; i++) round(i)
      expect(wasm.memoryBytes).toBe(warmed)
    } finally { wasm.dispose() }
  })

  it('rejects malformed input before native calls and keeps working afterwards', async () => {
    const wasm = await loadWasm(binary)
    try {
      for (const options of [{ mask: null }, { version: null }, { mode: null }, { version: 0 }, { minVersion: 41 }, { ecc: 'x' }]) {
        expect(() => wasm.encode('a', options as unknown as EncodeOptions)).toThrow(RangeError)
      }
      expect(() => wasm.encode({} as never)).toThrow(TypeError)
      expect(() => wasm.decode(null as never)).toThrow(TypeError)
      expect(() => wasm.decode({ data: new Uint8Array(9), width: 2, height: 2 }, { channels: 4 })).toThrow(RangeError)
      expect(() => wasm.decodeModules([], 21)).toThrow(RangeError)
      expect(wasm.encode('still usable')).toEqual(encode('still usable'))
    } finally { wasm.dispose() }
    await expect(loadWasm({} as never)).rejects.toThrow(TypeError)
    await expect(loadWasm(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]))).rejects.toThrow(/ABI/)
  })
})
