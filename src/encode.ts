import { ALIGNMENT_CENTRES, EC_BLOCKS } from './tables.js'

/** Error correction level: about 7, 15, 25 or 30 per cent of codewords recoverable. */
export type ErrorCorrection = 'L' | 'M' | 'Q' | 'H'

/** Data mode of a segment. */
export type Mode = 'numeric' | 'alphanumeric' | 'byte'

/** One data segment of a symbol, in stream order. */
export interface Segment {
  readonly mode: Mode
  /** The character count field: characters in numeric and alphanumeric mode, bytes in byte mode. */
  readonly count: number
}

export interface EncodeOptions {
  /** Error correction level. Default `'M'`. */
  ecc?: ErrorCorrection
  /** Exact version, 1-40, not below `minVersion`. Default: the smallest version, from `minVersion`, that fits. */
  version?: number
  /** Smallest version to consider when choosing one. Default 1. */
  minVersion?: number
  /** Mask pattern, 0-7. Default: the pattern with the lowest penalty score. */
  mask?: number
  /**
   * Encode the whole text as one segment of this mode. Default for text: the
   * mix of numeric, alphanumeric and byte segments with the fewest bits.
   * Bytes (`Uint8Array`) are always one byte segment.
   */
  mode?: Mode
  /**
   * When the symbol has a byte segment, start the stream with an ECI designator for
   * UTF-8 (assignment 26) so a reader need not guess the encoding. Default
   * false: most readers assume UTF-8 for byte mode, and the designator costs 12 bits.
   */
  eci?: boolean
}

export interface QrCode {
  readonly version: number
  readonly ecc: ErrorCorrection
  readonly mask: number
  /**
   * The widest mode among the segments: byte if any segment is byte, else
   * alphanumeric if any is, else numeric. For one segment, its mode.
   */
  readonly mode: Mode
  /** The data segments in order; one unless the encoder chose a mix. */
  readonly segments: readonly Segment[]
  /** Modules per side, 17 + 4 * version. Excludes the quiet zone. */
  readonly size: number
  /** Row-major modules, `size * size` entries, 1 for dark. */
  readonly modules: Uint8Array
}

/** Thrown when the data does not fit the requested or any version. */
export class QrCapacityError extends RangeError {
  override readonly name = 'QrCapacityError'
}

/** True if the module at column `x`, row `y` is dark; false outside the symbol (the quiet zone is light). */
export function isDark(qr: QrCode, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < qr.size && y < qr.size &&
    qr.modules[y * qr.size + x] === 1
}

export const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
export const EC_ORDER: readonly ErrorCorrection[] = ['L', 'M', 'Q', 'H']
const EC_FORMAT_BITS: Record<ErrorCorrection, number> = { L: 1, M: 0, Q: 3, H: 2 }
const MODES: readonly Mode[] = ['numeric', 'alphanumeric', 'byte']
const MODE_BITS: Record<Mode, number> = { numeric: 1, alphanumeric: 2, byte: 4 }
export const COUNT_BITS: Record<Mode, readonly [number, number, number]> = {
  numeric: [10, 12, 14],
  alphanumeric: [9, 11, 13],
  byte: [8, 16, 16],
}
const ECI_MODE = 7
const ECI_UTF8 = 26

/** Segment data: the characters in numeric and alphanumeric mode, the bytes in byte mode. */
interface Part {
  readonly mode: Mode
  readonly data: string | Uint8Array
}

/** Encodes text (as UTF-8 where byte mode is needed) or bytes as one QR code. */
export function encode(data: string | Uint8Array, options: EncodeOptions | null = {}): QrCode {
  if (typeof data !== 'string' && !isBytes(data)) {
    throw new TypeError(`encode takes a string or a Uint8Array, not ${describe(data)}`)
  }
  // null means no options, as undefined does.
  if (options === null) options = {}
  const ecc = options.ecc ?? 'M'
  if (!EC_ORDER.includes(ecc)) throw new RangeError(`Unknown error correction level: ${String(ecc)}`)
  const mask = options.mask
  if (mask !== undefined && !(Number.isInteger(mask) && mask >= 0 && mask <= 7)) {
    throw new RangeError('Mask must be an integer from 0 to 7')
  }
  const fixedVersion = options.version
  if (fixedVersion !== undefined && !validVersion(fixedVersion)) {
    throw new RangeError('Version must be an integer from 1 to 40')
  }
  const minVersion = options.minVersion ?? 1
  if (!validVersion(minVersion)) throw new RangeError('minVersion must be an integer from 1 to 40')
  if (fixedVersion !== undefined && fixedVersion < minVersion) throw new RangeError('Version is below minVersion')

  checkMode(data, options.mode)
  // Input no version can hold is refused before anything is built from it.
  if (data.length > maxInput(data, options.mode, ecc, fixedVersion ?? 40)) {
    throw new QrCapacityError(
      fixedVersion === undefined
        ? `Data does not fit any version at level ${ecc}`
        : `Data does not fit version ${fixedVersion} at level ${ecc}`,
    )
  }

  // One segment for bytes or a named mode; otherwise the cheapest mix, which
  // can differ by count field band, so it is worked out per band as needed.
  const single = singlePart(data, options.mode)
  const text = single ? undefined : analyse(data as string)
  const plans: (readonly Part[])[] = []
  const plan = (version: number): readonly Part[] => {
    const band = countBand(version)
    return (plans[band] ??= text ? optimalParts(text, band) : [single!])
  }
  const fits = (version: number): boolean => {
    const capacity = dataCodewords(version, ecc) * 8
    // The data bits alone, at each character's cheapest mode, bound every segmentation from below.
    if (text && text.floor > capacity) return false
    return streamLength(plan(version), version, options.eci === true) <= capacity
  }

  let version = fixedVersion ?? 0
  if (fixedVersion === undefined) {
    for (let v = minVersion; v <= 40 && version === 0; v++) if (fits(v)) version = v
    if (version === 0) throw new QrCapacityError(`Data does not fit any version at level ${ecc}`)
  } else if (!fits(version)) {
    throw new QrCapacityError(`Data does not fit version ${version} at level ${ecc}`)
  }

  const parts = plan(version)
  const band = countBand(version)
  const capacity = dataCodewords(version, ecc) * 8
  const bits: number[] = []
  if (options.eci === true && parts.some((p) => p.mode === 'byte')) {
    push(bits, ECI_MODE, 4)
    push(bits, ECI_UTF8, 8)
  }
  for (const part of parts) {
    push(bits, MODE_BITS[part.mode], 4)
    push(bits, part.data.length, COUNT_BITS[part.mode][band])
    appendData(bits, part)
  }
  for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)
  const codewords = new Uint8Array(capacity / 8)
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]!
    codewords[i / 8] = byte
  }
  for (let i = bits.length / 8, pad = 0xec; i < codewords.length; i++, pad ^= 0xec ^ 0x11) codewords[i] = pad

  const stream = interleave(codewords, version, ecc)
  const grid = new Grid(version)
  grid.placeData(stream)

  let chosen = mask ?? 0
  let modules: Uint8Array
  if (mask === undefined) {
    let best = Infinity
    let bestModules: Uint8Array = new Uint8Array(0)
    for (let m = 0; m < 8; m++) {
      const candidate = grid.render(ecc, m)
      const score = penalty(candidate, grid.size)
      if (score < best) {
        best = score
        chosen = m
        bestModules = candidate
      }
    }
    modules = bestModules
  } else {
    modules = grid.render(ecc, chosen)
  }
  const segments = parts.map((p) => ({ mode: p.mode, count: p.data.length }))
  const mode = MODES[Math.max(...parts.map((p) => MODES.indexOf(p.mode)))]!
  return { version, ecc, mask: chosen, mode, segments, size: grid.size, modules }
}

/** A Uint8Array (a Buffer is one), also from another realm, where instanceof would say no. */
function isBytes(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === '[object Uint8Array]'
}

/** A short name for a wrong argument, for error messages. */
function describe(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (Array.isArray(value)) return 'an array'
  const name = typeof value === 'object' ? Object.prototype.toString.call(value).slice(8, -1) : typeof value
  return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`
}

function validVersion(v: number): boolean {
  return Number.isInteger(v) && v >= 1 && v <= 40
}

export function countBand(version: number): 0 | 1 | 2 {
  return version <= 9 ? 0 : version <= 26 ? 1 : 2
}

/** Rejects a mode name that is not one, and a mode other than byte for bytes. */
function checkMode(data: string | Uint8Array, requested: Mode | undefined): void {
  if (requested !== undefined && !MODES.includes(requested)) throw new RangeError(`Unknown mode: ${String(requested)}`)
  if (typeof data !== 'string' && requested !== undefined && requested !== 'byte') {
    throw new RangeError('Bytes can only be encoded in byte mode')
  }
}

/**
 * The most bytes (for bytes) or UTF-16 code units (for text) that any version
 * up to `highest` can hold at level `ecc`; longer input cannot fit, whatever
 * its characters. Only a lower bound on the bits is used, so nothing that
 * fits is refused:
 *
 * - After the 4-bit mode indicator and a count field, a byte costs 8 bits, a
 *   digit at least 10/3, an alphanumeric character 5.5. A text character that
 *   needs more than one UTF-16 code unit or UTF-8 byte costs more than that
 *   per unit, so units and bytes bound the characters from above.
 * - The count field is taken at the highest version's band, and the capacity
 *   at the highest version. Capacity grows by at least 6 codewords (48 bits)
 *   a version and the count field by at most 8 bits across the bands (byte
 *   mode, 8 to 16), so what fits at a lower version fits within the bound
 *   for the highest.
 * - Text with no named mode is bounded at the cheapest mode and the
 *   narrowest count field, 10/3 bits a unit.
 */
function maxInput(data: string | Uint8Array, requested: Mode | undefined, ecc: ErrorCorrection, highest: number): number {
  const available = dataCodewords(highest, ecc) * 8 - 4
  const band = countBand(highest)
  const mode = typeof data === 'string' ? requested : 'byte'
  if (mode === 'byte') return Math.floor((available - COUNT_BITS.byte[band]) / 8)
  if (mode === 'numeric') return Math.floor(((available - COUNT_BITS.numeric[band]) * 3) / 10)
  if (mode === 'alphanumeric') return Math.floor(((available - COUNT_BITS.alphanumeric[band]) * 2) / 11)
  return Math.floor(((available - Math.min(...MODES.map((m) => COUNT_BITS[m][band]))) * 3) / 10)
}

/** The one segment for bytes or a requested mode, or undefined when the encoder should choose. */
function singlePart(data: string | Uint8Array, requested: Mode | undefined): Part | undefined {
  if (typeof data !== 'string') return { mode: 'byte', data }
  if (requested === 'numeric') {
    if (!/^[0-9]*$/.test(data)) throw new RangeError('Numeric mode takes digits only')
    return { mode: requested, data }
  }
  if (requested === 'alphanumeric') {
    for (const c of data) if (!ALPHANUMERIC.includes(c)) throw new RangeError(`Not in the alphanumeric set: ${c}`)
    return { mode: requested, data }
  }
  if (requested === 'byte') return { mode: requested, data: utf8(data) }
  return data === '' ? { mode: 'byte', data: new Uint8Array(0) } : undefined
}

/** Bits of the whole stream before the terminator: one ECI designator if any, then each segment. */
function streamLength(parts: readonly Part[], version: number, eci: boolean): number {
  const band = countBand(version)
  let total = eci && parts.some((p) => p.mode === 'byte') ? 12 : 0
  for (const { mode, data } of parts) {
    const countBits = COUNT_BITS[mode][band]
    if (data.length >= 2 ** countBits) return Infinity
    total += 4 + countBits + dataLength(mode, data.length)
  }
  return total
}

function dataLength(mode: Mode, n: number): number {
  if (mode === 'numeric') return Math.floor(n / 3) * 10 + [0, 4, 7][n % 3]!
  if (mode === 'alphanumeric') return Math.floor(n / 2) * 11 + (n % 2) * 6
  return n * 8
}

function appendData(bits: number[], { mode, data }: Part): void {
  if (mode === 'byte') {
    for (const b of data as Uint8Array) push(bits, b, 8)
    return
  }
  const text = data as string
  if (mode === 'numeric') {
    for (let i = 0; i < text.length; i += 3) {
      const group = text.slice(i, i + 3)
      push(bits, Number(group), group.length * 3 + 1)
    }
  } else {
    for (let i = 0; i < text.length; i += 2) {
      const a = ALPHANUMERIC.indexOf(text[i]!)
      if (i + 1 < text.length) push(bits, a * 45 + ALPHANUMERIC.indexOf(text[i + 1]!), 11)
      else push(bits, a, 6)
    }
  }
}

// Optimal segmentation (SPEC.md, Mode). The state before a character is the
// open segment: 0 none, 1-3 numeric holding 3k, 3k+1 or 3k+2 digits, 4-5
// alphanumeric holding an even or odd count, 6 byte. Costs are whole bits, so
// totals and ties are exact. A backward pass gives each state's cheapest
// (bits, segments) to the end; the forward walk takes the first mode, in the
// order numeric, alphanumeric, byte, that keeps that optimum.
const STATE_MODE = [-1, 0, 0, 0, 1, 1, 2]
/** Bits for one more character in each state's segment (times the UTF-8 length in byte mode), and the state after it. */
const STEP_BITS = [0, 4, 3, 3, 6, 5, 8]
const STEP_NEXT = [0, 2, 3, 1, 5, 4, 6]
/** The state whose step a new segment's first character takes, per mode. */
const OPENING = [1, 4, 6]

interface Text {
  readonly cps: readonly number[]
  /** Per character: 0 digit, 1 other alphanumeric, 2 anything else. */
  readonly kinds: readonly number[]
  readonly lengths: readonly number[]
  /** Data bits with every character in its cheapest mode, no headers. */
  readonly floor: number
}

function analyse(text: string): Text {
  // Over 16384 code units is over 8192 characters, more than any symbol holds.
  if (text.length > 16384) return { cps: [], kinds: [], lengths: [], floor: Infinity }
  const cps = codePoints(text)
  const kinds = cps.map((cp) => (cp >= 0x30 && cp <= 0x39 ? 0 : cp < 0x80 && ALPHANUMERIC.includes(String.fromCharCode(cp)) ? 1 : 2))
  const lengths = cps.map((cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4))
  let floor = 0
  for (let i = 0; i < cps.length; i++) floor += kinds[i] === 0 ? 10 / 3 : kinds[i] === 1 ? 5.5 : 8 * lengths[i]!
  return { cps, kinds, lengths, floor }
}

/** The segments with the fewest bits at this band, with SPEC.md's tie-breaks. */
function optimalParts({ cps, kinds, lengths }: Text, band: 0 | 1 | 2): Part[] {
  const n = cps.length
  const head = MODES.map((m) => 4 + COUNT_BITS[m][band])
  // Cost to the end from each (position, state), as bits * 8192 + segments.
  // Fewer than 8192 segments: text past the floor check has under 7100 characters.
  const cost = new Float64Array((n + 1) * 7)
  const via = (i: number, s: number, m: number): number => {
    const open = STATE_MODE[s] !== m
    const t = open ? OPENING[m]! : s
    return (STEP_BITS[t]! * (m === 2 ? lengths[i]! : 1) + (open ? head[m]! : 0)) * 8192 + (open ? 1 : 0) +
      cost[(i + 1) * 7 + STEP_NEXT[t]!]!
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let s = 0; s < 7; s++) {
      let best = Infinity
      for (let m = kinds[i]!; m < 3; m++) best = Math.min(best, via(i, s, m))
      cost[i * 7 + s] = best
    }
  }
  const parts: Part[] = []
  const close = (start: number, end: number, m: number) => {
    const slice = cps.slice(start, end)
    parts.push({ mode: MODES[m]!, data: m === 2 ? encodeUtf8(slice) : String.fromCharCode(...slice) })
  }
  let state = 0
  let start = 0
  for (let i = 0; i < n; i++) {
    let m = kinds[i]!
    while (via(i, state, m) !== cost[i * 7 + state]) m++
    if (STATE_MODE[state] !== m) {
      if (i > 0) close(start, i, STATE_MODE[state]!)
      start = i
    }
    state = STEP_NEXT[STATE_MODE[state] !== m ? OPENING[m]! : state]!
  }
  close(start, n, STATE_MODE[state]!)
  return parts
}

/** Code points of `text`, with lone surrogates as U+FFFD (as TextEncoder does). */
function codePoints(text: string): number[] {
  const out: number[] = []
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00)
        i++
      }
    }
    out.push(c >= 0xd800 && c <= 0xdfff ? 0xfffd : c)
  }
  return out
}

function encodeUtf8(cps: readonly number[]): Uint8Array {
  const out: number[] = []
  for (const c of cps) {
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return Uint8Array.from(out)
}

/** UTF-8 bytes of `text`, with lone surrogates as U+FFFD (as TextEncoder does). */
export function utf8(text: string): Uint8Array {
  return encodeUtf8(codePoints(text))
}

export function blocksFor(version: number, ecc: ErrorCorrection): readonly [number, number, number, number] {
  return EC_BLOCKS[version - 1]![EC_ORDER.indexOf(ecc)]!
}

function dataCodewords(version: number, ecc: ErrorCorrection): number {
  const [, g1, d1, g2] = blocksFor(version, ecc)
  return g1 * d1 + g2 * (d1 + 1)
}

function push(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
}

// Reed-Solomon over GF(256), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1.
export const EXP = new Uint8Array(512)
export const LOG = new Uint8Array(256)
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x
  LOG[x] = i
  x <<= 1
  if (x & 0x100) x ^= 0x11d
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!

export function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!
}

const generators = new Map<number, Uint8Array>()

/** Monic generator polynomial of the given degree, highest coefficient first. */
function generator(degree: number): Uint8Array {
  const cached = generators.get(degree)
  if (cached) return cached
  let poly = new Uint8Array([1])
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1)
    for (let j = 0; j < poly.length; j++) {
      next[j]! ^= poly[j]!
      next[j + 1]! ^= gfMul(poly[j]!, EXP[i]!)
    }
    poly = next
  }
  generators.set(degree, poly)
  return poly
}

function remainder(data: Uint8Array, degree: number): Uint8Array {
  const gen = generator(degree)
  const out = new Uint8Array(degree)
  for (const byte of data) {
    const factor = byte ^ out[0]!
    out.copyWithin(0, 1)
    out[degree - 1] = 0
    for (let i = 0; i < degree; i++) out[i]! ^= gfMul(gen[i + 1]!, factor)
  }
  return out
}

function interleave(codewords: Uint8Array, version: number, ecc: ErrorCorrection): Uint8Array {
  const [ecPerBlock, g1, d1, g2] = blocksFor(version, ecc)
  const data: Uint8Array[] = []
  const checks: Uint8Array[] = []
  for (let b = 0, offset = 0; b < g1 + g2; b++) {
    const length = b < g1 ? d1 : d1 + 1
    const block = codewords.subarray(offset, offset + length)
    offset += length
    data.push(block)
    checks.push(remainder(block, ecPerBlock))
  }
  const out = new Uint8Array(codewords.length + (g1 + g2) * ecPerBlock)
  let k = 0
  for (let i = 0; i <= d1; i++) for (const block of data) if (i < block.length) out[k++] = block[i]!
  for (let i = 0; i < ecPerBlock; i++) for (const block of checks) out[k++] = block[i]!
  return out
}

/** Format information coordinates (x, y) for bits 0 to 14, beside the top-left finder. */
export const FORMAT_COORDS: readonly (readonly [number, number])[] = [
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
  [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
]

export class Grid {
  readonly size: number
  private readonly base: Uint8Array
  private readonly reserved: Uint8Array
  private readonly version: number

  constructor(version: number) {
    this.version = version
    this.size = 17 + 4 * version
    this.base = new Uint8Array(this.size * this.size)
    this.reserved = new Uint8Array(this.size * this.size)
    const s = this.size
    this.finder(0, 0)
    this.finder(s - 7, 0)
    this.finder(0, s - 7)
    this.fn(8, s - 8, 1)
    const centres = ALIGNMENT_CENTRES[version - 1]!
    for (const cy of centres) {
      for (const cx of centres) {
        if (this.reserved[cy * s + cx]) continue
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            this.fn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1 ? 1 : 0)
          }
        }
      }
    }
    for (let i = 8; i < s - 8; i++) {
      if (!this.reserved[6 * s + i]) this.fn(i, 6, i % 2 === 0 ? 1 : 0)
      if (!this.reserved[i * s + 6]) this.fn(6, i, i % 2 === 0 ? 1 : 0)
    }
    for (let i = 0; i < 15; i++) {
      const [x, y] = FORMAT_COORDS[i]!
      this.fn(x, y, 0)
      if (i < 8) this.fn(s - 1 - i, 8, 0)
      else this.fn(8, s - 7 + (i - 8), 0)
    }
    if (version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          this.fn(i, s - 11 + j, 0)
          this.fn(s - 11 + j, i, 0)
        }
      }
    }
  }

  /** True for finder, separator, timing, alignment, format and version modules. */
  isReserved(x: number, y: number): boolean {
    return this.reserved[y * this.size + x] === 1
  }

  private fn(x: number, y: number, dark: number): void {
    this.base[y * this.size + x] = dark
    this.reserved[y * this.size + x] = 1
  }

  private finder(left: number, top: number): void {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const x = left + dx
        const y = top + dy
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) continue
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
        this.fn(x, y, ring !== 2 && ring !== 4 ? 1 : 0)
      }
    }
  }

  /** Zigzag placement of the final codeword stream; remainder bits are light. */
  placeData(stream: Uint8Array): void {
    const s = this.size
    const total = stream.length * 8
    let bit = 0
    let upward = true
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let step = 0; step < s; step++) {
        const y = upward ? s - 1 - step : step
        for (let i = 0; i < 2; i++) {
          const x = right - i
          if (this.reserved[y * s + x]) continue
          if (bit < total) this.base[y * s + x] = (stream[bit >>> 3]! >>> (7 - (bit & 7))) & 1
          bit++
        }
      }
      upward = !upward
    }
  }

  /** A copy with the data masked and the format and version information drawn. */
  render(ecc: ErrorCorrection, mask: number): Uint8Array {
    const s = this.size
    const out = this.base.slice()
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (!this.reserved[y * s + x] && maskBit(mask, x, y)) out[y * s + x]! ^= 1
      }
    }
    const format = formatBits(ecc, mask)
    for (let i = 0; i < 15; i++) {
      const bit = (format >>> i) & 1
      const [x, y] = FORMAT_COORDS[i]!
      out[y * s + x] = bit
      if (i < 8) out[8 * s + (s - 1 - i)] = bit
      else out[(s - 7 + (i - 8)) * s + 8] = bit
    }
    if (this.version >= 7) {
      const info = versionBits(this.version)
      for (let k = 0; k < 18; k++) {
        const bit = (info >>> k) & 1
        const i = Math.floor(k / 3)
        const j = k % 3
        out[(s - 11 + j) * s + i] = bit
        out[i * s + (s - 11 + j)] = bit
      }
    }
    return out
  }
}

export function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0
    case 1: return y % 2 === 0
    case 2: return x % 3 === 0
    case 3: return (x + y) % 3 === 0
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  }
}

export function formatBits(ecc: ErrorCorrection, mask: number): number {
  const data = (EC_FORMAT_BITS[ecc] << 3) | mask
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  return ((data << 10) | rem) ^ 0x5412
}

export function versionBits(version: number): number {
  let rem = version
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
  return (version << 12) | rem
}

/** Mask penalty per ISO/IEC 18004 section 7.8.3, scoring the finished symbol. */
export function penalty(modules: Uint8Array, size: number): number {
  let score = 0
  let dark = 0
  for (let y = 0; y < size; y++) {
    let rowRun = 0
    let colRun = 0
    for (let x = 0; x < size; x++) {
      const here = modules[y * size + x]!
      dark += here
      if (x > 0 && here === modules[y * size + x - 1]) rowRun++
      else {
        if (rowRun >= 5) score += rowRun - 2
        rowRun = 1
      }
      const down = modules[x * size + y]!
      if (x > 0 && down === modules[(x - 1) * size + y]) colRun++
      else {
        if (colRun >= 5) score += colRun - 2
        colRun = 1
      }
      if (x < size - 1 && y < size - 1) {
        if (
          here === modules[y * size + x + 1] &&
          here === modules[(y + 1) * size + x] &&
          here === modules[(y + 1) * size + x + 1]
        ) score += 3
      }
      if (x + 6 < size && finderLike(modules, size, x, y, 1, 0)) score += 40
      if (x + 6 < size && finderLike(modules, size, y, x, 0, 1)) score += 40
    }
    if (rowRun >= 5) score += rowRun - 2
    if (colRun >= 5) score += colRun - 2
  }
  const total = size * size
  score += Math.floor((Math.abs(dark * 2 - total) * 10) / total) * 10
  return score
}

const FINDER_RUN = [1, 0, 1, 1, 1, 0, 1]

/** 1:1:3:1:1 starting at (x, y) along (dx, dy), with four light modules on one side. */
function finderLike(m: Uint8Array, size: number, x: number, y: number, dx: number, dy: number): boolean {
  for (let i = 0; i < 7; i++) if (m[(y + i * dy) * size + x + i * dx] !== FINDER_RUN[i]) return false
  return lightRun(m, size, x, y, dx, dy, -4) || lightRun(m, size, x, y, dx, dy, 7)
}

/**
 * Four modules from offset `from` along the line are light. A run that would
 * leave the symbol does not count: the quiet zone is not scored. ZXing scores
 * it the same way, which keeps mask choice identical to that oracle.
 */
function lightRun(m: Uint8Array, size: number, x: number, y: number, dx: number, dy: number, from: number): boolean {
  for (let i = from; i < from + 4; i++) {
    const px = x + i * dx
    const py = y + i * dy
    if (px < 0 || py < 0 || px >= size || py >= size) return false
    if (m[py * size + px] === 1) return false
  }
  return true
}
