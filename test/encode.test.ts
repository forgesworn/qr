import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { encode, isDark, type Mode, QrCapacityError, type Segment, toSvg } from '../src/index.js'
import { ALPHANUMERIC, COUNT_BITS, countBand, utf8 } from '../src/encode.js'
import { readSymbol } from '../src/symbol.js'

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

  it('keeps a named mode and bytes as one segment', () => {
    const text = 'HTTPS://EXAMPLE.COM/ORDER/20261115000123456789'
    expect(encode(text).segments.length).toBeGreaterThan(1)
    expect(encode(text, { mode: 'alphanumeric' }).segments).toEqual([{ mode: 'alphanumeric', count: text.length }])
    expect(encode(text, { mode: 'byte' }).segments).toEqual([{ mode: 'byte', count: text.length }])
    expect(encode(utf8(text)).segments).toEqual([{ mode: 'byte', count: text.length }])
    expect(encode('').segments).toEqual([{ mode: 'byte', count: 0 }])
  })

  it('reports the widest mode, which is what a single segment would have needed', () => {
    expect(encode('0123456789')).toMatchObject({ mode: 'numeric', segments: [{ mode: 'numeric', count: 10 }] })
    expect(encode('ORDER/20261115000123')).toMatchObject({ mode: 'alphanumeric', segments: [{ mode: 'alphanumeric', count: 6 }, { mode: 'numeric', count: 14 }] })
    expect(encode('order no. 000123456789')).toMatchObject({ mode: 'byte', segments: [{ mode: 'byte', count: 10 }, { mode: 'numeric', count: 12 }] })
  })

  it('counts bytes, not characters, in byte segments, and never splits a character', () => {
    const text = 'Café ☕ 会議 2026-11-15 0123456789 😀 a\ud800b'
    const qr = encode(text, { ecc: 'L' })
    const bytes = qr.segments.filter((s) => s.mode === 'byte').reduce((n, s) => n + s.count, 0)
    const ascii = qr.segments.filter((s) => s.mode !== 'byte').reduce((n, s) => n + s.count, 0)
    expect(bytes + ascii).toBe(utf8(text).length)
    const read = readSymbol((x, y) => isDark(qr, x, y), qr.size)
    expect(read?.text).toBe(text.replace('\ud800', '\ufffd'))
  })

  it('puts one ECI designator first when a segment is byte, and none otherwise', () => {
    const read = (text: string) => {
      const qr = encode(text, { eci: true })
      return readSymbol((x, y) => isDark(qr, x, y), qr.size)
    }
    expect(read('Ünïcode 20261115123456 ÀÉÎ')).toMatchObject({ text: 'Ünïcode 20261115123456 ÀÉÎ', eci: [26] })
    expect(read('ORDER/20261115000123')).toMatchObject({ text: 'ORDER/20261115000123', eci: [] })
    expect(read('')).toMatchObject({ text: '', eci: [26] })
    // Two byte segments still share the one designator.
    const two = encode('Ünïcode 20261115123456 ÀÉÎ', { eci: true })
    expect(two.segments.filter((s) => s.mode === 'byte').length).toBe(2)
    expect(read('Ünïcode 20261115123456 ÀÉÎ')?.eci).toEqual([26])
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

  it('replaces characters XML does not allow, and keeps astral characters', () => {
    const svg = toSvg(encode('a'), { title: 'a\u0001b\u000bc\ud800d\uffffe \u{1f600}\tf', dark: '#000\u0000' })
    expect(svg).toContain('<title>a\ufffdb\ufffdc\ufffdd\ufffde \u{1f600}\tf</title>')
    expect(svg).toContain('fill="#000\ufffd"')
    expect(/[\0-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/.test(svg)).toBe(false)
  })

  it('adds no title or image role for an empty title', () => {
    const svg = toSvg(encode('a'), { title: '' })
    expect(svg).not.toContain('<title>')
    expect(svg).not.toContain('role=')
  })

  it('rejects colours and titles that are not strings', () => {
    const qr = encode('a')
    expect(() => toSvg(qr, { dark: 5 as unknown as string })).toThrow(TypeError)
    expect(() => toSvg(qr, { light: 5 as unknown as string })).toThrow(TypeError)
    expect(() => toSvg(qr, { title: 5 as unknown as string })).toThrow(TypeError)
  })
})

// The segmentation rule of SPEC.md (Mode), checked against two separate
// computations: every per-character mode assignment for short text, and a
// segment-boundary search for long text. Neither shares code with the encoder.
describe('mixed segments', () => {
  const MODE_ORDER: readonly Mode[] = ['numeric', 'alphanumeric', 'byte']
  const chars = (text: string) => Array.from(text, (c) => (c.length === 1 && c >= '\ud800' && c <= '\udfff' ? '�' : c))
  const allowed = (c: string): Mode[] =>
    c >= '0' && c <= '9' ? ['numeric', 'alphanumeric', 'byte'] : ALPHANUMERIC.includes(c) ? ['alphanumeric', 'byte'] : ['byte']
  const dataBits = (mode: Mode, n: number) =>
    mode === 'numeric' ? Math.floor(n / 3) * 10 + [0, 4, 7][n % 3]! : mode === 'alphanumeric' ? Math.floor(n / 2) * 11 + (n % 2) * 6 : 8 * n
  const segmentBits = (mode: Mode, run: string[], band: 0 | 1 | 2) => {
    const count = mode === 'byte' ? utf8(run.join('')).length : run.length
    return { count, bits: 4 + COUNT_BITS[mode][band] + dataBits(mode, count) }
  }
  const bitsOf = (segments: readonly Segment[], version: number) =>
    segments.reduce((sum, { mode, count }) => sum + 4 + COUNT_BITS[mode][countBand(version)] + dataBits(mode, count), 0)

  /** Lexicographic order of per-character modes, numeric < alphanumeric < byte. */
  const earlier = (a: number[], b: number[]) => {
    const k = a.findIndex((m, i) => m !== b[i])
    return k >= 0 && a[k]! < b[k]!
  }

  /** Every assignment of modes to characters; the least by (bits, segments, modes in order). */
  function bruteForce(text: string, band: 0 | 1 | 2): Segment[] {
    const cs = chars(text)
    let best: { bits: number; segs: Segment[]; seq: number[] } | undefined
    const walk = (seq: number[]) => {
      if (seq.length < cs.length) {
        for (const m of allowed(cs[seq.length]!)) walk([...seq, MODE_ORDER.indexOf(m)])
        return
      }
      const segs: Segment[] = []
      let bits = 0
      for (let a = 0, b = 0; a < cs.length; a = b) {
        while (b < cs.length && seq[b] === seq[a]) b++
        const s = segmentBits(MODE_ORDER[seq[a]!]!, cs.slice(a, b), band)
        bits += s.bits
        segs.push({ mode: MODE_ORDER[seq[a]!]!, count: s.count })
      }
      if (!best || bits < best.bits || (bits === best.bits &&
        (segs.length < best.segs.length || (segs.length === best.segs.length && earlier(seq, best.seq))))) {
        best = { bits, segs, seq }
      }
    }
    walk([])
    return best && cs.length > 0 ? best.segs : [{ mode: 'byte', count: 0 }]
  }

  /** Fewest bits over all segmentations, by searching segment boundaries (adjacent segments may even share a mode). */
  function fewestBits(text: string, band: 0 | 1 | 2): number {
    const cs = chars(text)
    if (cs.length === 0) return 4 + COUNT_BITS.byte[band]
    const best = [0]
    for (let j = 1; j <= cs.length; j++) {
      best[j] = Infinity
      for (const mode of MODE_ORDER) {
        let bytes = 0
        for (let i = j - 1; i >= 0 && allowed(cs[i]!).includes(mode); i--) {
          bytes += utf8(cs[i]!).length
          const count = mode === 'byte' ? bytes : j - i
          best[j] = Math.min(best[j]!, best[i]! + 4 + COUNT_BITS[mode][band] + dataBits(mode, count))
        }
      }
    }
    return best[cs.length]!
  }

  function prng(seed: number): () => number {
    let s = seed >>> 0
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32
  }

  it('chooses what the stated rule chooses among every assignment, in each band', () => {
    const random = prng(5)
    const alphabet = ['0', '1', '7', '9', '0', '4', 'A', 'Z', ' ', ':', 'a', 'q', 'é', '☕', '😀', '\ud800']
    for (let t = 0; t < 400; t++) {
      const length = 1 + Math.floor(random() * 8)
      const text = Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')
      for (const version of [3, 10, 27]) {
        expect(encode(text, { version, ecc: 'L' }).segments, `${JSON.stringify(text)} v${version}`).toEqual(bruteForce(text, countBand(version)))
      }
    }
  })

  it('settles ties by fewer segments, then by the earlier mode at the first difference', () => {
    // Bytes "abc123" cost 60 bits, as do byte "abc" and numeric "123": one segment wins.
    expect(encode('abc123', { version: 1 }).segments).toEqual([{ mode: 'byte', count: 6 }])
    expect(bruteForce('abc123', 0)).toEqual([{ mode: 'byte', count: 6 }])
    for (const text of ['1A', '12A', 'A12', '0000AAAA', 'aa0000', '0000aa', 'a1b2c3', 'A0000000a']) {
      expect(encode(text, { version: 1, ecc: 'L' }).segments, text).toEqual(bruteForce(text, 0))
    }
  })

  it('needs no more bits than any segmentation, for every vector and random long text', () => {
    const { vectors } = JSON.parse(readFileSync(new URL('../vectors/encode-vectors.json', import.meta.url), 'utf8')) as {
      vectors: { id: string; text: string; ecc: 'L' | 'M' | 'Q' | 'H'; requestedVersion: number | null }[]
    }
    for (const v of vectors) {
      if (v.text.length > 1500) continue // the boundary search is quadratic
      const qr = encode(v.text, { ecc: v.ecc, ...(v.requestedVersion === null ? {} : { version: v.requestedVersion }) })
      expect(bitsOf(qr.segments, qr.version), v.id).toBe(fewestBits(v.text, countBand(qr.version)))
    }
    const random = prng(7)
    const runs = ['abcdefgh', '01234567', 'ABCDEFGH:/.-', 'éè']
    for (let t = 0; t < 40; t++) {
      let text = ''
      while (text.length < 300) {
        const set = runs[Math.floor(random() * runs.length)]!
        for (let k = 1 + Math.floor(random() * 14); k > 0; k--) text += set[Math.floor(random() * set.length)]
      }
      for (const version of [14, 27]) {
        const qr = encode(text, { version, ecc: 'L' })
        expect(bitsOf(qr.segments, version)).toBe(fewestBits(text, countBand(version)))
      }
    }
  }, 60_000)

  it('uses a byte segment only for text that needs one', () => {
    const random = prng(9)
    const alphabet = '0123456789AZ $:az-é'
    for (let t = 0; t < 300; t++) {
      const text = Array.from({ length: 1 + Math.floor(random() * 40) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')
      const needs = Array.from(text).some((c) => !ALPHANUMERIC.includes(c))
      expect(encode(text).segments.some((s) => s.mode === 'byte'), text).toBe(needs)
    }
  })

  it('picks the band-optimal segments either side of the band edges', () => {
    const six = 'abcdefgh123456'
    expect(encode(six.repeat(16), { ecc: 'L' }).version).toBe(9)
    expect(encode(six.repeat(16), { ecc: 'L' }).segments.length).toBe(32)
    expect(encode(six.repeat(16), { ecc: 'L', version: 10 }).segments).toEqual([{ mode: 'byte', count: 218 }, { mode: 'numeric', count: 6 }])
    expect(encode(six.repeat(17), { ecc: 'L' })).toMatchObject({ version: 10, segments: [{ mode: 'byte', count: 232 }, { mode: 'numeric', count: 6 }] })
    const eight = 'abcdefgh12345678'
    expect(encode(eight.repeat(86), { ecc: 'L' }).version).toBe(26)
    expect(encode(eight.repeat(86), { ecc: 'L' }).segments.length).toBe(172)
    expect(encode(eight.repeat(87), { ecc: 'L' })).toMatchObject({ version: 27, segments: [{ mode: 'byte', count: 1384 }, { mode: 'numeric', count: 8 }] })
  })

  it('shrinks payment URIs with a lowercase scheme and an uppercase body', () => {
    const random = prng(2026)
    const bech32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
    const pick = (n: number) => Array.from({ length: n }, () => bech32[Math.floor(random() * 32)]).join('').toUpperCase()
    const shapes: Record<string, string> = {
      bolt11: `lightning:LNBC2500U1P${pick(330)}`,
      bip21: `bitcoin:BC1Q${pick(38)}?amount=0.00025000&lightning=LNBC2500U1P${pick(330)}`,
      lnurl: `lightning:LNURL1${pick(180)}`,
      gs1: 'https://id.example.com/01/09506000134352/10/ABC123/21/000000012345',
    }
    const versions = (text: string, mode?: Mode) =>
      (['L', 'M', 'Q', 'H'] as const).map((ecc) => encode(text, { ecc, ...(mode ? { mode } : {}) }).version)
    const table = Object.fromEntries(Object.entries(shapes).map(([name, text]) => [name, { single: versions(text, 'byte'), mixed: versions(text) }]))
    expect(table).toEqual({
      bolt11: { single: [12, 14, 17, 20], mixed: [10, 11, 14, 16] },
      bip21: { single: [13, 16, 19, 22], mixed: [11, 13, 16, 18] },
      lnurl: { single: [9, 10, 12, 15], mixed: [7, 8, 10, 12] },
      gs1: { single: [4, 5, 6, 8], mixed: [3, 4, 5, 6] },
    })
  })

  it('stays quick on the longest payloads', () => {
    const random = prng(11)
    const digits = Array.from({ length: 7089 }, () => String(Math.floor(random() * 10))).join('')
    const mixed = Array.from({ length: 2900 }, (_, i) => (i % 40 < 8 ? String(i % 10) : 'abcdefgh'[i % 8])).join('')
    const start = performance.now()
    expect(encode(digits, { ecc: 'L' }).version).toBe(40)
    expect(encode(mixed, { ecc: 'L' }).version).toBeLessThanOrEqual(40)
    expect(() => encode('x'.repeat(100_000))).toThrow(QrCapacityError)
    expect(() => encode('7'.repeat(7090), { ecc: 'L' })).toThrow(QrCapacityError)
    expect(performance.now() - start).toBeLessThan(2000)
  })
})
