// The conformance pack: vectors/conformance.json and the pictures it names.
// It is what a port in another language checks itself against, stage by
// stage, without reading this code: greyscale conversion, reading a module
// grid, and for each picture the binarised image, the reduced sizes, the
// finder patterns, the result and the work counted. QR_WRITE_CONFORMANCE=1
// regenerates it from this decoder. vectors/README.md describes the format.
// Every payload is made up.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { binarise, shrink, toLuminance } from '../src/binarise.js'
import { decodeCounted, decodeModules } from '../src/decode.js'
import { blocksFor, encode, FORMAT_COORDS, Grid, type ErrorCorrection } from '../src/encode.js'
import { findFinders, type Work } from '../src/locate.js'
import { seg, symbol } from './builder.js'
import { bent, prng } from './photo.js'
import { readPng, writePng } from './png.js'

const VECTORS = new URL('../vectors/', import.meta.url)
const PACK = new URL('conformance.json', VECTORS)
const OWN = 'conformance/'

interface Grey { data: Uint8Array; width: number; height: number }
type XY = [number, number]

interface Reading {
  bytes: string
  text: string
  version: number
  ecc: ErrorCorrection
  mask: number
  eci: number[]
  corrected: number
  mirrored: boolean
}

interface Pack {
  note: string
  luminance: { width: number; height: number; rgba: string; grey: string }[]
  symbols: { name: string; size: number; rows: string[]; result: Reading | null }[]
  frames: {
    file: string
    width: number
    height: number
    luminance: string
    bits: string
    reduced: Record<'2' | '4' | '8', string | null>
    finders: Record<'0.5' | '0.8', [number, number, number, number][]>
    result: (Reading & { inverted: boolean; location: { topLeft: XY; topRight: XY; bottomLeft: XY; alignment: XY | null } }) | null
    work: Required<Work>
  }[]
}

const hex = (bytes: ArrayLike<number>) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
const unhex = (s: string) => Uint8Array.from({ length: s.length / 2 }, (_, i) => parseInt(s.slice(2 * i, 2 * i + 2), 16))
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const counter = (): Required<Work> => ({ steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 })

/** Rows of a module grid, most significant bit first, padded with zeros to whole bytes, as in encode-vectors.json. */
function rowsOf(modules: ArrayLike<number>, size: number): string[] {
  const out: string[] = []
  for (let y = 0; y < size; y++) {
    const row: number[] = []
    for (let x = 0; x < size; x += 8) {
      let b = 0
      for (let k = 0; k < 8; k++) b = (b << 1) | (x + k < size ? modules[y * size + x + k]! : 0)
      row.push(b)
    }
    out.push(hex(row))
  }
  return out
}

function gridOf(rows: string[], size: number): Uint8Array {
  const modules = new Uint8Array(size * size)
  rows.forEach((row, y) => {
    const bytes = unhex(row)
    for (let x = 0; x < size; x++) modules[y * size + x] = (bytes[x >> 3]! >> (7 - (x & 7))) & 1
  })
  return modules
}

function reading(r: NonNullable<ReturnType<typeof decodeModules>>): Reading {
  return { bytes: hex(r.bytes), text: r.text, version: r.version, ecc: r.ecc, mask: r.mask, eci: [...r.eci], corrected: r.corrected, mirrored: r.mirrored }
}

function symbolEntry(name: string, modules: ArrayLike<number>, size: number): Pack['symbols'][number] {
  const got = decodeModules(modules, size)
  return { name, size, rows: rowsOf(modules, size), result: got ? reading(got) : null }
}

function frameEntry(file: string, image: Grey): Pack['frames'][number] {
  const luminance = toLuminance(image.data, image.width, image.height, 1)
  const bits = binarise(luminance)
  const reduced = {} as Pack['frames'][number]['reduced']
  for (const f of [2, 4, 8] as const) {
    reduced[`${f}`] = Math.floor(image.width / f) >= 1 && Math.floor(image.height / f) >= 1 ? sha(shrink(luminance, f).data) : null
  }
  const finders = {} as Pack['frames'][number]['finders']
  for (const t of [0.5, 0.8] as const) finders[`${t}`] = findFinders(bits, t).map((f) => [f.x, f.y, f.moduleSize, f.count])
  const work = counter()
  const got = decodeCounted(image, {}, work)
  const at = (p: { x: number; y: number }): XY => [p.x, p.y]
  return {
    file,
    width: image.width,
    height: image.height,
    luminance: sha(luminance.data),
    bits: sha(bits.data),
    reduced,
    finders,
    result: got
      ? {
          ...reading({ ...got, mirrored: got.mirrored }),
          inverted: got.inverted,
          location: {
            topLeft: at(got.location.topLeft),
            topRight: at(got.location.topRight),
            bottomLeft: at(got.location.bottomLeft),
            alignment: got.location.alignment ? at(got.location.alignment) : null,
          },
        }
      : null,
    work,
  }
}

/** Module positions of each codeword, in the order the bit stream is placed. */
function codewords(version: number): XY[][] {
  const grid = new Grid(version)
  const size = grid.size
  const [ec, g1, d1, g2] = blocksFor(version, 'L')
  const total = g1 * d1 + g2 * (d1 + 1) + (g1 + g2) * ec
  const bits: XY[] = []
  let upward = true
  for (let right = size - 1; right >= 1 && bits.length < total * 8; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step
      for (let i = 0; i < 2; i++) if (!grid.isReserved(right - i, y) && bits.length < total * 8) bits.push([right - i, y])
    }
    upward = !upward
  }
  return Array.from({ length: total }, (_, k) => bits.slice(8 * k, 8 * k + 8))
}

/** A copy of `modules` with one module turned over in each of the first `n` codewords. */
function damage(modules: Uint8Array, size: number, version: number, n: number): Uint8Array {
  const out = Uint8Array.from(modules)
  const places = codewords(version)
  for (let k = 0; k < n; k++) {
    const [x, y] = places[k]![3]!
    out[y * size + x]! ^= 1
  }
  return out
}

function fill(width: number, height: number, f: (x: number, y: number) => number): Grey {
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = f(x, y)
  return { data, width, height }
}

/** Modules drawn straight, `scale` pixels each, four modules of quiet zone; `lines` adds a dark row every third. */
function straight(modules: ArrayLike<number>, size: number, scale: number, lines = false): Grey {
  return fill((size + 8) * scale, (size + 8) * scale, (x, y) => {
    const mx = Math.floor(x / scale) - 4
    const my = Math.floor(y / scale) - 4
    const dark = (mx >= 0 && my >= 0 && mx < size && my < size && modules[my * size + mx] === 1) || (lines && y % 3 === 0)
    return dark ? 40 : 215
  })
}

function build(write: boolean): Pack {
  if (write) {
    rmSync(new URL(OWN, VECTORS), { recursive: true, force: true })
    mkdirSync(new URL(OWN, VECTORS), { recursive: true })
  }
  // Greyscale from RGBA: (77 R + 150 G + 29 B) >> 8, blended onto white by alpha.
  const random = prng(8128)
  const luminance: Pack['luminance'] = []
  for (const [width, height, opaque] of [[4, 2, true], [5, 3, false], [1, 1, false], [16, 4, false]] as const) {
    const rgba = Uint8Array.from({ length: width * height * 4 }, (_, i) => (opaque && i % 4 === 3 ? 255 : Math.floor(random() * 256)))
    luminance.push({ width, height, rgba: hex(rgba), grey: hex(toLuminance(rgba, width, height, 4).data) })
  }
  luminance.push({ width: 3, height: 1, rgba: 'ffffff00' + '000000ff' + '00000000', grey: hex(toLuminance(unhex('ffffff00000000ff00000000'), 3, 1, 4).data) })

  // Module grids.
  const symbols: Pack['symbols'] = []
  const one = encode('CONFORMANCE 1', { ecc: 'L', version: 1 })
  symbols.push(symbolEntry('version 1-L, clean', one.modules, one.size))
  symbols.push(symbolEntry('version 1-L, an error in each of two codewords: corrected', damage(one.modules, one.size, 1, 2), one.size))
  symbols.push(symbolEntry('version 1-L, an error in each of three codewords: past the Table 9 capacity, no read', damage(one.modules, one.size, 1, 3), one.size))
  const two = encode('https://example.com/conformance', { ecc: 'M' })
  const transposed = Uint8Array.from({ length: two.size * two.size }, (_, i) => two.modules[(i % two.size) * two.size + Math.floor(i / two.size)]!)
  symbols.push(symbolEntry('mirrored: the grid transposed', transposed, two.size))
  const zero = new Grid(1)
  zero.placeData(new Uint8Array(26))
  symbols.push(symbolEntry('every data codeword zero: no read', zero.render('M', 0), zero.size))
  const seven = encode('https://example.com/conformance/version-seven/' + '0123456789'.repeat(6), { ecc: 'M', version: 7 })
  const blind = Uint8Array.from(seven.modules)
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) blind[(seven.size - 11 + j) * seven.size + i] = blind[i * seven.size + seven.size - 11 + j] = 0
  symbols.push(symbolEntry('version 7 with both version blocks blank: read from its size', blind, seven.size))
  const format = Uint8Array.from(two.modules)
  for (let i = 0; i < 3; i++) format[FORMAT_COORDS[i]![1] * two.size + FORMAT_COORDS[i]![0]]! ^= 1
  symbols.push(symbolEntry('three modules of one format copy turned over: read from the other', format, two.size))
  const built = (name: string, bits: number[]) => {
    const s = symbol(bits, 2, 'L', 1)
    symbols.push(symbolEntry(name, s.modules, s.size))
  }
  built('ECI 23, Windows 1252: the euro sign', [...seg.eci(23), ...seg.bytes(Uint8Array.of(0x80, 0x31), 8)])
  built('ECI 26, UTF-8, around a kanji segment', [...seg.eci(26), ...seg.bytes(Uint8Array.of(0xc3, 0xa9), 8), ...seg.kanji([0x0d9f], 8), ...seg.bytes(Uint8Array.of(0xc3, 0xa9), 8)])
  built('kanji mode', seg.kanji([0x0d9f, 0x1aaa], 8))
  built('hanzi mode, GB2312', seg.hanzi([0x122f, 0x0f23], 8))
  built('hanzi mode with another subset: no read', seg.hanzi([0x122f], 8, 2))
  built('numeric, alphanumeric and byte segments together', [...seg.numeric('0123456789', 10), ...seg.alnum('AB-12', 9), ...seg.bytes(Uint8Array.of(0x61, 0x62), 8)])

  // Pictures: the synthetic photographs already in decode-frames/, then ones made here for the paths those do not reach.
  const frames: Pack['frames'] = []
  const listed = (JSON.parse(readFileSync(new URL('decode-frames.json', VECTORS), 'utf8')) as { frames: { file: string }[] }).frames
  for (const f of listed) frames.push(frameEntry(`decode-frames/${f.file}`, readPng(new Uint8Array(readFileSync(new URL(`decode-frames/${f.file}`, VECTORS))))))
  const own = (name: string, image: Grey) => {
    const file = `${OWN}${name}.png`
    if (write) writeFileSync(new URL(file, VECTORS), writePng(image))
    frames.push(frameEntry(file, write ? image : readPng(new Uint8Array(readFileSync(new URL(file, VECTORS))))))
  }
  const noise = prng(1729)
  own('blank', fill(96, 64, () => 200))
  own('gradient', fill(120, 90, (x, y) => Math.floor((x * 255) / 120 + (y * 40) / 90) & 255))
  own('noise', fill(160, 120, () => Math.floor(noise() * 256)))
  own('finder-tiles', fill(200, 160, (x, y) => {
    const i = Math.floor((x % 20) / 2)
    const j = Math.floor((y % 20) / 2)
    return i < 7 && j < 7 && Math.max(Math.abs(i - 3), Math.abs(j - 3)) !== 2 ? 20 : 230
  }))
  const tiny = encode('7', { ecc: 'L', version: 1 })
  own('under-40-pixels', straight(tiny.modules, tiny.size, 1))
  const plain = encode('https://example.com/close-up', { ecc: 'M' })
  own('close-up-scan-lines', straight(plain.modules, plain.size, 24, true))
  const gated = Uint8Array.from(plain.modules)
  for (let i = 0; i < 3; i++) gated[FORMAT_COORDS[i]![1] * plain.size + FORMAT_COORDS[i]![0]]! ^= 1
  own('close-up-format-damaged', straight(gated, plain.size, 24, true))
  const lens = encode('https://example.com/m/' + 'conformance0123456789abcdefghijklmnopqrs', { ecc: 'M', version: 12 })
  own('bent-version-12', bent(lens.modules, lens.size, 4, 0.04))
  const nothing = new Grid(2)
  nothing.placeData(new Uint8Array(44))
  own('zero-codewords', straight(nothing.render('M', 0), nothing.size, 6))

  const note =
    'Conformance vectors for ports of this encoder and decoder; vectors/README.md describes every field. ' +
    'Generated from the TypeScript implementation; the Kotlin port passes them unchanged. All payloads are made up.'
  return { note, luminance, symbols, frames }
}

describe('conformance pack', () => {
  const writing = process.env.QR_WRITE_CONFORMANCE === '1'
  if (writing) writeFileSync(PACK, `${JSON.stringify(build(true), null, 1)}\n`)
  const pack = JSON.parse(readFileSync(PACK, 'utf8')) as Pack

  it('reaches every path of the decoder', () => {
    const f = pack.frames
    // The ordinary read, the second look, the mesh, the reduced sizes (a read and a refusal), and no read at all.
    expect(f.filter((x) => x.result && x.work.second === 0 && x.work.reduced === 0).length).toBeGreaterThan(30)
    expect(f.some((x) => x.result && x.work.second > 0)).toBe(true)
    expect(f.some((x) => x.result && x.work.meshes > 0)).toBe(true)
    expect(f.some((x) => x.result && x.work.reduced > 0)).toBe(true)
    expect(f.some((x) => !x.result && x.work.reduced > 0)).toBe(true)
    expect(f.some((x) => x.result?.inverted)).toBe(true)
    expect(f.some((x) => x.result?.mirrored)).toBe(true)
    expect(f.some((x) => x.result?.location.alignment)).toBe(true)
    expect(pack.symbols.some((s) => s.result === null)).toBe(true)
    expect(pack.symbols.some((s) => s.result?.corrected === 2)).toBe(true)
  })

  it('converts RGBA to greyscale as recorded', () => {
    for (const v of pack.luminance) expect(hex(toLuminance(unhex(v.rgba), v.width, v.height, 4).data), `${v.width} x ${v.height}`).toBe(v.grey)
  })

  it('reads every module grid as recorded', () => {
    for (const v of pack.symbols) {
      const got = decodeModules(gridOf(v.rows, v.size), v.size)
      expect(got ? reading(got) : null, v.name).toEqual(v.result)
    }
  })

  it('gives every recorded stage, result and work count for each picture', () => {
    for (const v of pack.frames) {
      const image = readPng(new Uint8Array(readFileSync(new URL(v.file, VECTORS))))
      expect(frameEntry(v.file, image), v.file).toEqual(v)
    }
  })

  it('is what this decoder generates', () => {
    expect(build(false)).toEqual(pack)
  })
})
