import { readFileSync, writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fromEci, kanjiText } from '../src/text.js'
import { readSymbol } from '../src/symbol.js'
import { bitsOf, seg, symbol } from './builder.js'

const FIXTURE = new URL('./charsets.json', import.meta.url)

const SINGLE = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 21, 22, 23, 24, 27, 170]
const SAMPLES: Record<number, number[][]> = {
  20: [[0x93, 0x5f], [0x82, 0xa0, 0x41]],
  25: [[0x00, 0x41, 0x4e, 0x2d], [0xd8, 0x3d, 0xde, 0x00], [0x00, 0x41, 0x00], [0xdc, 0x00], [0xfe, 0xff, 0x00, 0x41]],
  28: [[0xa4, 0xa4, 0xa4, 0xe5]],
  29: [[0xd6, 0xd0, 0xce, 0xc4]],
  30: [[0xc7, 0xd1, 0xb1, 0xb9]],
  33: [[0x41, 0x00, 0x2d, 0x4e], [0x00, 0xd8, 0x00, 0xdc], [0x41]],
}

/** Every 13-bit kanji-mode value, 0 to 8191. */
function kanjiValues(): number[] {
  return Array.from({ length: 8192 }, (_, v) => v)
}

/** The Shift_JIS pair a 13-bit kanji-mode value stands for (section 7.4.6). */
function sjisOf(v: number): number {
  const s = (Math.floor(v / 0xc0) << 8) | v % 0xc0
  return s + (s < 0x1f00 ? 0x8140 : 0xc140)
}

interface Fixture {
  kanji: string
  single: Record<string, string>
  samples: Record<string, [string, string][]>
}

function build(): Fixture {
  const kanji = kanjiValues().map((v) => kanjiText(sjisOf(v))).join('')
  const single: Record<string, string> = {}
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
  for (const eci of SINGLE) {
    const text = fromEci(eci, bytes)
    if (text !== undefined) single[eci] = text
  }
  const samples: Record<string, [string, string][]> = {}
  for (const [eci, list] of Object.entries(SAMPLES)) {
    const rows: [string, string][] = []
    for (const s of list) {
      const text = fromEci(Number(eci), Uint8Array.from(s))
      if (text !== undefined) rows.push([s.map((b) => b.toString(16).padStart(2, '0')).join(''), text])
    }
    if (rows.length > 0) samples[eci] = rows
  }
  return { kanji, single, samples }
}

if (process.env.QR_WRITE_CHARSETS === '1') {
  writeFileSync(FIXTURE, JSON.stringify(build(), null, 1) + '\n')
}

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture

// Version 2, level L: count lengths of the first band.
function read(bits: number[]) {
  const { modules, size } = symbol(bits, 2, 'L', 1)
  return readSymbol((x, y) => modules[y * size + x] === 1, size)
}

describe('character sets', () => {
  it('reads every kanji-mode value the way the fixture records', () => {
    expect(build().kanji).toBe(fixture.kanji)
    expect([...fixture.kanji].length).toBe(kanjiValues().length)
  })

  it('reads single-byte and multi-byte ECIs the way the fixture records', () => {
    const got = build()
    expect(got.single).toEqual(fixture.single)
    expect(got.samples).toEqual(fixture.samples)
  })

  it('decodes the standard example kanji and keeps bytes as Shift_JIS', () => {
    const got = read(seg.kanji([0x0d9f, 0x1aaa], 8))!
    expect(got.text).toBe('点茗')
    expect(Array.from(got.bytes)).toEqual([0x93, 0x5f, 0xe4, 0xaa])
  })

  it('keeps the ECI in force after a kanji character', () => {
    const got = read([...seg.eci(26), ...seg.bytes(Uint8Array.of(0xc3, 0xa9), 8), ...seg.kanji([0x0d9f], 8), ...seg.bytes(Uint8Array.of(0xc3, 0xa9), 8)])!
    expect(got.text).toBe('é点é')
  })

  it('reads ECI 9 as Greek and ECI 20 as Shift_JIS', () => {
    expect(read([...seg.eci(9), ...seg.bytes(Uint8Array.of(0xc1, 0xc2, 0xc3), 8)])!.text).toBe('ΑΒΓ')
    expect(read([...seg.eci(20), ...seg.bytes(Uint8Array.of(0x93, 0x5f), 8)])!.text).toBe('点')
  })

  it('reads Big5, GB and EUC-KR text', () => {
    expect(read([...seg.eci(28), ...seg.bytes(Uint8Array.of(0xa4, 0xa4, 0xa4, 0xe5), 8)])!.text).toBe('中文')
    expect(read([...seg.eci(29), ...seg.bytes(Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4), 8)])!.text).toBe('中文')
    expect(read([...seg.eci(30), ...seg.bytes(Uint8Array.of(0xc7, 0xd1, 0xb1, 0xb9), 8)])!.text).toBe('한국')
  })

  it('treats a byte the Windows code page leaves undefined as U+FFFD, and ASCII high bytes likewise', () => {
    expect(read([...seg.eci(23), ...seg.bytes(Uint8Array.of(0x41, 0x81), 8)])!.text).toBe('A�')
    expect(read([...seg.eci(27), ...seg.bytes(Uint8Array.of(0x41, 0xe9), 8)])!.text).toBe('A�')
  })

  it('leaves ECI 3 as Latin-1 and an unassigned ECI to the fallback', () => {
    expect(read([...seg.eci(3), ...seg.bytes(Uint8Array.of(0xe9), 8)])!.text).toBe('é')
    expect(read([...seg.eci(14), ...seg.bytes(Uint8Array.of(0xe9), 8)])!.text).toBe('é')
    expect(read([...seg.eci(900), ...seg.bytes(Uint8Array.of(0x68, 0x69), 8)])!.text).toBe('hi')
  })

  it('never changes bytes', () => {
    const got = read([...seg.eci(9), ...seg.bytes(Uint8Array.of(0xc1, 0xc2), 8)])!
    expect(Array.from(got.bytes)).toEqual([0xc1, 0xc2])
  })

  void bitsOf
})

describe('a platform without the labels', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function fresh() {
    vi.resetModules()
    const text = await import('../src/text.js')
    const sym = await import('../src/symbol.js')
    return { ...text, ...sym }
  }

  it('imports and falls back when TextDecoder is absent', async () => {
    vi.stubGlobal('TextDecoder', undefined)
    const m = await fresh()
    expect(m.fromEci(9, Uint8Array.of(0xc1))).toBeUndefined()
    expect(m.kanjiText(0x935f)).toBe('�')
    const { modules, size } = symbol([...seg.eci(9), ...seg.bytes(Uint8Array.of(0xc1, 0x41), 8)], 2, 'L', 1)
    const got = m.readSymbol((x, y) => modules[y * size + x] === 1, size)!
    expect(got.text).toBe('ÁA')
  })

  it('falls back for a label the platform rejects', async () => {
    vi.stubGlobal(
      'TextDecoder',
      class {
        constructor(label: string) {
          if (label !== 'utf-8') throw new RangeError('unknown label')
        }
        decode() {
          return ''
        }
      },
    )
    const m = await fresh()
    expect(m.fromEci(28, Uint8Array.of(0xa4, 0xa4))).toBeUndefined()
    expect(m.kanjiText(0x935f)).toBe('�')
  })
})
