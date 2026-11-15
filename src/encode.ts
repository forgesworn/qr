import { ALIGNMENT_CENTRES, EC_BLOCKS } from './tables.js'

/** Error correction level: about 7, 15, 25 or 30 per cent of codewords recoverable. */
export type ErrorCorrection = 'L' | 'M' | 'Q' | 'H'

/** Data mode of the single segment a code carries. */
export type Mode = 'numeric' | 'alphanumeric' | 'byte'

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
   * Data mode. Default for text: numeric if every character is a digit,
   * alphanumeric if every character is in that set, otherwise byte.
   * Bytes (`Uint8Array`) are always byte mode.
   */
  mode?: Mode
  /**
   * In byte mode, prefix an ECI designator for UTF-8 (assignment 26) so a
   * reader need not guess the encoding. Default false: most readers assume
   * UTF-8 for byte mode, and the designator costs 12 bits.
   */
  eci?: boolean
}

export interface QrCode {
  readonly version: number
  readonly ecc: ErrorCorrection
  readonly mask: number
  readonly mode: Mode
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
const MODE_BITS: Record<Mode, number> = { numeric: 1, alphanumeric: 2, byte: 4 }
export const COUNT_BITS: Record<Mode, readonly [number, number, number]> = {
  numeric: [10, 12, 14],
  alphanumeric: [9, 11, 13],
  byte: [8, 16, 16],
}
const ECI_MODE = 7
const ECI_UTF8 = 26

/** Encodes text (as UTF-8 in byte mode) or bytes as one QR code. */
export function encode(data: string | Uint8Array, options: EncodeOptions = {}): QrCode {
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

  const mode = chooseMode(data, options.mode)
  const payload = segmentBits(data, mode)
  const eci = mode === 'byte' && options.eci === true

  const version = fixedVersion ?? chooseVersion(mode, payload, eci, ecc, minVersion)
  const capacity = dataCodewords(version, ecc) * 8
  const countBits = COUNT_BITS[mode][countBand(version)]
  if (payload.count >= 1 << countBits || headerLength(countBits, eci) + payload.bits.length > capacity) {
    throw new QrCapacityError(`Data does not fit version ${version} at level ${ecc}`)
  }

  const bits: number[] = []
  if (eci) {
    push(bits, ECI_MODE, 4)
    push(bits, ECI_UTF8, 8)
  }
  push(bits, MODE_BITS[mode], 4)
  push(bits, payload.count, countBits)
  for (const bit of payload.bits) bits.push(bit)
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
  return { version, ecc, mask: chosen, mode, size: grid.size, modules }
}

function validVersion(v: number): boolean {
  return Number.isInteger(v) && v >= 1 && v <= 40
}

export function countBand(version: number): 0 | 1 | 2 {
  return version <= 9 ? 0 : version <= 26 ? 1 : 2
}

function headerLength(countBits: number, eci: boolean): number {
  return (eci ? 12 : 0) + 4 + countBits
}

function chooseMode(data: string | Uint8Array, requested: Mode | undefined): Mode {
  if (typeof data !== 'string') {
    if (requested !== undefined && requested !== 'byte') throw new RangeError('Bytes can only be encoded in byte mode')
    return 'byte'
  }
  if (requested === 'numeric') {
    if (!/^[0-9]*$/.test(data)) throw new RangeError('Numeric mode takes digits only')
    return requested
  }
  if (requested === 'alphanumeric') {
    for (const c of data) if (!ALPHANUMERIC.includes(c)) throw new RangeError(`Not in the alphanumeric set: ${c}`)
    return requested
  }
  if (requested === 'byte') return requested
  if (requested !== undefined) throw new RangeError(`Unknown mode: ${String(requested)}`)
  let numeric = true
  for (const c of data) {
    if (c >= '0' && c <= '9') continue
    if (!ALPHANUMERIC.includes(c)) return 'byte'
    numeric = false
  }
  return data.length > 0 && numeric ? 'numeric' : data.length > 0 ? 'alphanumeric' : 'byte'
}

interface Payload {
  /** Characters for numeric and alphanumeric, bytes for byte mode. */
  readonly count: number
  readonly bits: readonly number[]
}

function segmentBits(data: string | Uint8Array, mode: Mode): Payload {
  const bits: number[] = []
  if (mode === 'byte') {
    const bytes = typeof data === 'string' ? utf8(data) : data
    for (const b of bytes) push(bits, b, 8)
    return { count: bytes.length, bits }
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
  return { count: text.length, bits }
}

/** UTF-8 bytes of `text`, with lone surrogates as U+FFFD (as TextEncoder does). */
export function utf8(text: string): Uint8Array {
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
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return Uint8Array.from(out)
}

function chooseVersion(mode: Mode, payload: Payload, eci: boolean, ecc: ErrorCorrection, minVersion: number): number {
  for (let v = minVersion; v <= 40; v++) {
    const countBits = COUNT_BITS[mode][countBand(v)]
    if (payload.count >= 1 << countBits) continue
    if (headerLength(countBits, eci) + payload.bits.length <= dataCodewords(v, ecc) * 8) return v
  }
  throw new QrCapacityError(`Data does not fit any version at level ${ecc}`)
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
