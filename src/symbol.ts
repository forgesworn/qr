import {
  ALPHANUMERIC,
  blocksFor,
  countBand,
  EC_ORDER,
  FORMAT_COORDS,
  formatBits,
  Grid,
  maskBit,
  versionBits,
  type ErrorCorrection,
} from './encode.js'
import { correct } from './rs.js'
import { fromEci, fromUtf8, hanziText, isUtf8, kanjiText, looksShiftJis, unread } from './text.js'

/** What a symbol says, once read. */
export interface Payload {
  /** The decoded text. */
  readonly text: string
  /** The payload as bytes: byte-mode data as stored, numeric and alphanumeric as ASCII. */
  readonly bytes: Uint8Array
  readonly version: number
  readonly ecc: ErrorCorrection
  readonly mask: number
  /** ECI assignment numbers in the order they appeared; empty if none. */
  readonly eci: readonly number[]
  /** Codewords Reed-Solomon had to correct. */
  readonly corrected: number
  /** Present when the symbol is one of a structured-append set; `text` and `bytes` then hold this symbol's part only. */
  readonly structuredAppend?: StructuredAppend
  /** Present when the symbol carries an FNC1 indicator (GS1 or an industry application). */
  readonly fnc1?: Fnc1
}

/** The header of a structured-append symbol. */
export interface StructuredAppend {
  /** This symbol's place in the set, counting from 0. */
  readonly index: number
  /** How many symbols the set has, 1 to 16. */
  readonly total: number
  /** The parity byte: the XOR of every byte of the whole message, the same in each symbol of the set. */
  readonly parity: number
}

/**
 * An FNC1 indicator. In alphanumeric segments `%` then reads as the group
 * separator U+001D and `%%` as `%`, in `text` and `bytes` alike.
 */
export interface Fnc1 {
  /** 'first' is the GS1 format; 'second' is an industry application. */
  readonly position: 'first' | 'second'
  /** Second position only: one letter or two digits, as a string. */
  readonly applicationIndicator?: string
}

/** Reads modules through a callback: true for dark, x across, y down. */
export type ModuleReader = (x: number, y: number) => boolean

const FORMATS: readonly { bits: number; ecc: ErrorCorrection; mask: number }[] = EC_ORDER.flatMap((ecc) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((mask) => ({ bits: formatBits(ecc, mask), ecc, mask })),
)
const VERSIONS: readonly { bits: number; version: number }[] = Array.from({ length: 34 }, (_, i) => ({
  bits: versionBits(i + 7),
  version: i + 7,
}))

function popcount(n: number): number {
  let c = 0
  for (; n !== 0; n &= n - 1) c++
  return c
}

function nearest<T extends { bits: number }>(table: readonly T[], reads: readonly number[]): T | undefined {
  let best: T | undefined
  let distance = 4 // both codes correct up to three bit errors
  for (const read of reads) {
    for (const entry of table) {
      const d = popcount(entry.bits ^ read)
      if (d < distance) {
        distance = d
        best = entry
      }
    }
  }
  return best
}

const PLACEMENTS: (Uint16Array | undefined)[] = []

/**
 * The modules of a version that carry the bit stream, in the order the
 * standard places it: two columns at a time from the right, snaking up and
 * down, skipping the function patterns. Each is y * 256 + x. Worked out once
 * a version and kept.
 */
function placement(version: number): Uint16Array {
  let places = PLACEMENTS[version]
  if (places === undefined) {
    const grid = new Grid(version)
    const size = grid.size
    const found: number[] = []
    let upward = true
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let step = 0; step < size; step++) {
        const y = upward ? size - 1 - step : step
        for (let i = 0; i < 2; i++) {
          const x = right - i
          if (!grid.isReserved(x, y)) found.push((y << 8) | x)
        }
      }
      upward = !upward
    }
    places = Uint16Array.from(found)
    PLACEMENTS[version] = places
  }
  return places
}

/**
 * The version a symbol of `size` modules declares: from the size below
 * version 7, else from its version blocks, or undefined when neither copy
 * decodes.
 */
export function readVersion(read: ModuleReader, size: number): number | undefined {
  if (size < 45) return (size - 17) / 4
  let bottomLeft = 0
  let topRight = 0
  for (let k = 17; k >= 0; k--) {
    const i = Math.floor(k / 3)
    const j = k % 3
    bottomLeft = (bottomLeft << 1) | (read(i, size - 11 + j) ? 1 : 0)
    topRight = (topRight << 1) | (read(size - 11 + j, i) ? 1 : 0)
  }
  return nearest(VERSIONS, [bottomLeft, topRight])?.version
}

/** A version hint only when both BCH copies independently decode to the same version. */
export function agreedVersion(read: ModuleReader, size: number): number | undefined {
  if (size < 45) return undefined
  let bottomLeft = 0
  let topRight = 0
  for (let k = 17; k >= 0; k--) {
    const i = Math.floor(k / 3)
    const j = k % 3
    bottomLeft = (bottomLeft << 1) | (read(i, size - 11 + j) ? 1 : 0)
    topRight = (topRight << 1) | (read(size - 11 + j, i) ? 1 : 0)
  }
  const first = nearest(VERSIONS, [bottomLeft])?.version
  const second = nearest(VERSIONS, [topRight])?.version
  return first !== undefined && first === second ? first : undefined
}

/**
 * The errors a block of this symbol may have had corrected: half of its check
 * codewords once the p of Table 9 is withheld to catch a misdecode. Only
 * versions 1 to 3 withhold any; Reed-Solomon alone would correct one more at
 * 1-L, 1-M and 2-L.
 */
export function correctable(version: number, ecc: ErrorCorrection): number {
  const p = version === 1 ? (ecc === 'L' ? 3 : ecc === 'M' ? 2 : 1) : version === 2 && ecc === 'L' ? 2 : version === 3 && ecc === 'L' ? 1 : 0
  return (blocksFor(version, ecc)[0] - p) >> 1
}

/**
 * Decodes a symbol from its modules. `size` must be 17 + 4v. From version 7
 * a version block that decodes decides, and a size that disagrees fails;
 * if neither decodes, the size decides. Returns undefined when the symbol
 * cannot be read.
 */
export function readSymbol(read: ModuleReader, size: number): Payload | undefined {
  if (size < 21 || size > 177 || (size - 17) % 4 !== 0) return undefined
  // When neither version copy decodes, the size says which version it is.
  const version = readVersion(read, size) ?? (size - 17) / 4
  if (17 + 4 * version !== size) return undefined

  let first = 0
  let second = 0
  for (let i = 14; i >= 0; i--) {
    const [x, y] = FORMAT_COORDS[i]!
    first = (first << 1) | (read(x, y) ? 1 : 0)
    second = (second << 1) | (read(i < 8 ? size - 1 - i : 8, i < 8 ? 8 : size - 7 + (i - 8)) ? 1 : 0)
  }
  const format = nearest(FORMATS, [first, second])
  if (format === undefined) return undefined

  const [ecPerBlock, g1, d1, g2] = blocksFor(version, format.ecc)
  const blockCount = g1 + g2
  const dataCount = g1 * d1 + g2 * (d1 + 1)
  const places = placement(version)
  const word = (index: number): number => {
    let value = 0
    const end = Math.min((index + 1) * 8, places.length)
    for (let bit = index * 8; bit < end; bit++) {
      const x = places[bit]! & 255
      const y = places[bit]! >> 8
      if (read(x, y) !== maskBit(format.mask, x, y)) value |= 0x80 >>> (bit & 7)
    }
    return value
  }
  // Extract a block directly from its interleaved positions. A failed block
  // rejects the symbol, so no later blocks need sampling or allocating.
  const data = new Uint8Array(dataCount)
  let corrected = 0
  const limit = correctable(version, format.ecc)
  for (let b = 0, offset = 0; b < blockCount; b++) {
    const length = b < g1 ? d1 : d1 + 1
    const block = new Uint8Array(length + ecPerBlock)
    for (let i = 0; i < d1; i++) block[i] = word(i * blockCount + b)
    if (b >= g1) block[d1] = word(d1 * blockCount + b - g1)
    for (let i = 0; i < ecPerBlock; i++) block[length + i] = word(dataCount + i * blockCount + b)
    const fixed = correct(block, ecPerBlock)
    if (fixed < 0 || fixed > limit) return undefined
    corrected += fixed
    data.set(block.subarray(0, length), offset)
    offset += length
  }

  // Zero in every data codeword is what a texture matching the mask pattern
  // corrects to, and it parses as a terminator: no symbol holds it.
  if (data.every((word) => word === 0)) return undefined

  const parsed = parse(data, version)
  if (parsed === undefined) return undefined
  return { ...parsed, version, ecc: format.ecc, mask: format.mask, corrected }
}

class Bits {
  private position = 0
  constructor(private readonly data: Uint8Array) {}

  get available(): number {
    return this.data.length * 8 - this.position
  }

  read(count: number): number {
    if (count > this.available) throw new RangeError('Ran off the end of the data')
    let value = 0
    for (let i = 0; i < count; i++, this.position++) {
      value = (value << 1) | ((this.data[this.position >>> 3]! >>> (7 - (this.position & 7))) & 1)
    }
    return value
  }
}

interface Run {
  eci: number | undefined
  bytes: number[]
  /** Text already decided, for a kanji or hanzi character. */
  fixed?: string
}

const KANJI_COUNT_BITS = [8, 10, 12] as const

interface Parsed {
  text: string
  bytes: Uint8Array
  eci: number[]
  structuredAppend?: StructuredAppend
  fnc1?: Fnc1
}

/** ISO 18004 7.4.8.3: 0-99 are two digits, ASCII + 100 gives a letter. */
function applicationIndicator(value: number): string | undefined {
  if (value <= 99) return String(value).padStart(2, '0')
  if (value >= 165 && value <= 190) return String.fromCharCode(value - 100)
  if (value >= 197 && value <= 222) return String.fromCharCode(value - 100)
  return undefined
}

function parse(data: Uint8Array, version: number): Parsed | undefined {
  const bits = new Bits(data)
  const band = countBand(version)
  const runs: Run[] = [{ eci: undefined, bytes: [] }]
  const eci: number[] = []
  const out: number[] = []
  let structuredAppend: StructuredAppend | undefined
  let fnc1: Fnc1 | undefined
  const emit = (byte: number) => {
    runs[runs.length - 1]!.bytes.push(byte)
    out.push(byte)
  }
  try {
    while (bits.available >= 4) {
      const mode = bits.read(4)
      if (mode === 0) break
      if (mode === 1) {
        let count = bits.read([10, 12, 14][band]!)
        for (; count >= 3; count -= 3) {
          const v = bits.read(10)
          if (v > 999) return undefined
          for (const c of String(v).padStart(3, '0')) emit(c.charCodeAt(0))
        }
        if (count > 0) {
          const v = bits.read(count === 2 ? 7 : 4)
          if (v >= (count === 2 ? 100 : 10)) return undefined
          for (const c of String(v).padStart(count, '0')) emit(c.charCodeAt(0))
        }
      } else if (mode === 2) {
        let count = bits.read([9, 11, 13][band]!)
        const segment: number[] = []
        for (; count >= 2; count -= 2) {
          const v = bits.read(11)
          if (v >= 45 * 45) return undefined
          segment.push(ALPHANUMERIC.charCodeAt(Math.floor(v / 45)), ALPHANUMERIC.charCodeAt(v % 45))
        }
        if (count === 1) {
          const v = bits.read(6)
          if (v >= 45) return undefined
          segment.push(ALPHANUMERIC.charCodeAt(v))
        }
        // Under FNC1, within one segment: %% is %, and a lone % is the group separator.
        for (let i = 0; i < segment.length; i++) {
          if (fnc1 !== undefined && segment[i] === 0x25) {
            if (segment[i + 1] === 0x25) i++
            else {
              emit(0x1d)
              continue
            }
          }
          emit(segment[i]!)
        }
      } else if (mode === 4) {
        const count = bits.read([8, 16, 16][band]!)
        for (let i = 0; i < count; i++) emit(bits.read(8))
      } else if (mode === 8) {
        // Kanji: kept as its Shift_JIS bytes; each character's text is the platform's Shift_JIS.
        const count = bits.read(KANJI_COUNT_BITS[band])
        for (let i = 0; i < count; i++) {
          const v = bits.read(13)
          let sjis = (Math.floor(v / 0xc0) << 8) | v % 0xc0
          sjis += sjis < 0x1f00 ? 0x8140 : 0xc140
          out.push(sjis >>> 8, sjis & 0xff)
          const current = runs[runs.length - 1]!.eci
          runs.push({ eci: current, bytes: [], fixed: kanjiText(sjis) }, { eci: current, bytes: [] })
        }
      } else if (mode === 13) {
        // Hanzi (GB/T 18284): subset 1 is GB2312, kept as its bytes; any other subset, or a
        // value outside the GB2312 rows or on an empty cell, rejects the symbol.
        if (bits.read(4) !== 1) return undefined
        const count = bits.read(KANJI_COUNT_BITS[band])
        for (let i = 0; i < count; i++) {
          const v = bits.read(13)
          const row = Math.floor(v / 0x60)
          const lead = row + (row < 0x0a ? 0xa1 : 0xa6)
          const low = (v % 0x60) + 0xa1
          const text = hanziText(lead, low)
          if (text === undefined) return undefined
          out.push(lead, low)
          const current = runs[runs.length - 1]!.eci
          runs.push({ eci: current, bytes: [], fixed: text }, { eci: current, bytes: [] })
        }
      } else if (mode === 7) {
        const first = bits.read(8)
        const value =
          (first & 0x80) === 0
            ? first
            : (first & 0xc0) === 0x80
              ? ((first & 0x3f) << 8) | bits.read(8)
              : (first & 0xe0) === 0xc0
                ? ((first & 0x1f) << 16) | bits.read(16)
                : -1
        if (value < 0) return undefined
        eci.push(value)
        runs.push({ eci: value, bytes: [] })
      } else if (mode === 3) {
        const sequence = bits.read(8)
        const parity = bits.read(8)
        structuredAppend ??= { index: sequence >>> 4, total: (sequence & 15) + 1, parity }
      } else if (mode === 5) {
        fnc1 ??= { position: 'first' }
      } else if (mode === 9) {
        const indicator = applicationIndicator(bits.read(8))
        if (indicator === undefined) return undefined
        fnc1 ??= { position: 'second', applicationIndicator: indicator }
      } else {
        return undefined
      }
    }
  } catch {
    return undefined
  }
  let text = ''
  for (const run of runs) text += decodeRun(run)
  return {
    text,
    bytes: Uint8Array.from(out),
    eci,
    ...(structuredAppend && { structuredAppend }),
    ...(fnc1 && { fnc1 }),
  }
}

/**
 * ECI 26 is UTF-8; 3 and 1 are Latin-1; the other assignments the platform
 * knows (text.ts) are read as that set, and one it does not know is not
 * guessed at (unread). With no ECI, valid UTF-8 is taken as UTF-8, bytes
 * that look like Shift_JIS (looksShiftJis) as that, and the rest as Latin-1.
 */
function decodeRun(run: Run): string {
  if (run.fixed !== undefined) return run.fixed
  const bytes = Uint8Array.from(run.bytes)
  if (run.eci === 3 || run.eci === 1) return latin1(bytes)
  if (run.eci === 26) return fromUtf8(bytes)
  if (run.eci !== undefined && bytes.length > 0) return fromEci(run.eci, bytes) ?? unread(run.eci, bytes)
  if (isUtf8(bytes)) return fromUtf8(bytes)
  if (run.eci === undefined && looksShiftJis(bytes)) {
    const text = fromEci(20, bytes)
    if (text !== undefined && !text.includes('\ufffd')) return text
  }
  return latin1(bytes)
}

function latin1(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return s
}

/**
 * A deferred curved-map candidate needs an exact version word matching its size.
 * Each independently readable peer must agree; at least one format copy must
 * decode within the ordinary BCH radius. This admits a retry, never a result.
 * The optional conflict mode tags a uniquely stronger format copy (0--2 errors
 * versus 3); callers must keep it separate from ordinary curvature candidates.
 */
export function curvatureHeader(read: ModuleReader, size: number, allowConflict = false): {ecc: ErrorCorrection; mask: number; distance: number; conflict?: true} | undefined {
  if (size < 45) return undefined
  let va = 0, vb = 0
  for (let k = 17; k >= 0; k--) {
    const i = Math.floor(k / 3), j = k % 3
    va = (va << 1) | +read(i, size - 11 + j)
    vb = (vb << 1) | +read(size - 11 + j, i)
  }
  const version = (size - 17) / 4, expected = versionBits(version)
  if (va !== expected && vb !== expected) return undefined
  const firstVersion = nearest(VERSIONS, [va]), secondVersion = nearest(VERSIONS, [vb])
  if (firstVersion && firstVersion.version !== version || secondVersion && secondVersion.version !== version) return undefined
  let a = 0, b = 0
  for (let i = 14; i >= 0; i--) {
    const [x, y] = FORMAT_COORDS[i]!
    a = (a << 1) | +read(x, y)
    b = (b << 1) | +read(i < 8 ? size - 1 - i : 8, i < 8 ? 8 : size - 7 + i - 8)
  }
  const first = nearest(FORMATS, [a]), second = nearest(FORMATS, [b])
  if (first && second && first.bits !== second.bits) {
    if (!allowConflict) return undefined
    const firstDistance = popcount(first.bits ^ a), secondDistance = popcount(second.bits ^ b)
    const distance = Math.min(firstDistance, secondDistance)
    if (distance > 2 || Math.max(firstDistance, secondDistance) !== 3) return undefined
    const stronger = firstDistance < secondDistance ? first : second
    return { ecc: stronger.ecc, mask: stronger.mask, distance, conflict: true }
  }
  const format = first ?? second
  if (!format) return undefined
  return { ecc: format.ecc, mask: format.mask, distance: Math.min(popcount(format.bits ^ a), popcount(format.bits ^ b)) }
}


/**
 * An exact matching version word with a contradictory peer at the outer BCH
 * radius can indicate warped header sampling. Both decoded format copies must
 * agree. This only admits late refinement; it never admits a decoded payload.
 */
export function versionPeerHeader(read: ModuleReader, size: number): {ecc: ErrorCorrection; mask: number; distance: number} | undefined {
  if (size < 45 || size > 177 || (size - 17) % 4 !== 0) return undefined
  let va = 0, vb = 0
  for (let k = 17; k >= 0; k--) {
    const i = Math.floor(k / 3), j = k % 3
    va = (va << 1) | +read(i, size - 11 + j)
    vb = (vb << 1) | +read(size - 11 + j, i)
  }
  const version = (size - 17) / 4, expected = versionBits(version)
  if (va !== expected && vb !== expected) return undefined
  const word = va === expected ? vb : va
  const peer = nearest(VERSIONS, [word])
  if (!peer || peer.version === version || popcount(peer.bits ^ word) !== 3) return undefined
  let a = 0, b = 0
  for (let i = 14; i >= 0; i--) {
    const [x, y] = FORMAT_COORDS[i]!
    a = (a << 1) | +read(x, y)
    b = (b << 1) | +read(i < 8 ? size - 1 - i : 8, i < 8 ? 8 : size - 7 + i - 8)
  }
  const first = nearest(FORMATS, [a]), second = nearest(FORMATS, [b])
  if (!first || !second || first.bits !== second.bits) return undefined
  return { ecc: first.ecc, mask: first.mask,
    distance: Math.min(popcount(first.bits ^ a), popcount(second.bits ^ b)) }
}
