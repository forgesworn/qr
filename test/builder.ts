// Builds symbols from raw segments, so tests can reach headers and modes the
// encoder never writes (structured append, FNC1, kanji, ECI). It has its own
// Reed-Solomon and interleave, apart from src/encode.ts.
import { ALPHANUMERIC, blocksFor, EXP, gfMul, Grid, type ErrorCorrection } from '../src/encode.js'

export function bitsOf(value: number, length: number): number[] {
  const out: number[] = []
  for (let i = length - 1; i >= 0; i--) out.push((value >>> i) & 1)
  return out
}

function remainder(data: Uint8Array, degree: number): Uint8Array {
  let gen = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(gen.length + 1).fill(0)
    for (let j = 0; j < gen.length; j++) {
      next[j]! ^= gen[j]!
      next[j + 1]! ^= gfMul(gen[j]!, EXP[i]!)
    }
    gen = next
  }
  const out = new Uint8Array(degree)
  for (const byte of data) {
    const factor = byte ^ out[0]!
    out.copyWithin(0, 1)
    out[degree - 1] = 0
    for (let i = 0; i < degree; i++) out[i]! ^= gfMul(gen[i + 1]!, factor)
  }
  return out
}

/** Pads `bits` to the capacity of version and level and lays out the finished symbol. */
export function symbol(bits: number[], version: number, ecc: ErrorCorrection, mask: number): { modules: Uint8Array; size: number } {
  const [ec, g1, d1, g2] = blocksFor(version, ecc)
  const capacity = (g1 * d1 + g2 * (d1 + 1)) * 8
  if (bits.length > capacity) throw new RangeError('Too long for the symbol')
  const all = bits.slice()
  for (let i = 0; i < 4 && all.length < capacity; i++) all.push(0)
  while (all.length % 8) all.push(0)
  const words = new Uint8Array(capacity / 8)
  for (let i = 0; i < all.length; i += 8) words[i / 8] = all.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0)
  for (let i = all.length / 8, pad = 0xec; i < words.length; i++, pad ^= 0xec ^ 0x11) words[i] = pad

  const data: Uint8Array[] = []
  const checks: Uint8Array[] = []
  for (let b = 0, offset = 0; b < g1 + g2; b++) {
    const length = b < g1 ? d1 : d1 + 1
    data.push(words.subarray(offset, offset + length))
    checks.push(remainder(words.subarray(offset, offset + length), ec))
    offset += length
  }
  const stream: number[] = []
  for (let i = 0; i <= d1; i++) for (const block of data) if (i < block.length) stream.push(block[i]!)
  for (let i = 0; i < ec; i++) for (const block of checks) stream.push(block[i]!)
  const grid = new Grid(version)
  grid.placeData(Uint8Array.from(stream))
  return { modules: grid.render(ecc, mask), size: grid.size }
}

/** Segments; `countBits` is the character count length for the version's band. */
export const seg = {
  numeric(text: string, countBits: number): number[] {
    const out = [...bitsOf(1, 4), ...bitsOf(text.length, countBits)]
    for (let i = 0; i < text.length; i += 3) {
      const group = text.slice(i, i + 3)
      out.push(...bitsOf(Number(group), group.length * 3 + 1))
    }
    return out
  },
  alnum(text: string, countBits: number): number[] {
    const out = [...bitsOf(2, 4), ...bitsOf(text.length, countBits)]
    for (let i = 0; i < text.length; i += 2) {
      const a = ALPHANUMERIC.indexOf(text[i]!)
      out.push(...(i + 1 < text.length ? bitsOf(a * 45 + ALPHANUMERIC.indexOf(text[i + 1]!), 11) : bitsOf(a, 6)))
    }
    return out
  },
  bytes(bytes: ArrayLike<number>, countBits: number): number[] {
    const out = [...bitsOf(4, 4), ...bitsOf(bytes.length, countBits)]
    for (let i = 0; i < bytes.length; i++) out.push(...bitsOf(bytes[i]!, 8))
    return out
  },
  /** Kanji mode from 13-bit values. */
  kanji(values: number[], countBits: number): number[] {
    return [...bitsOf(8, 4), ...bitsOf(values.length, countBits), ...values.flatMap((v) => bitsOf(v, 13))]
  },
  eci(value: number): number[] {
    return [...bitsOf(7, 4), ...(value < 128 ? bitsOf(value, 8) : bitsOf(0x8000 | value, 16))]
  },
  structuredAppend(index: number, total: number, parity: number): number[] {
    return [...bitsOf(3, 4), ...bitsOf(index, 4), ...bitsOf(total - 1, 4), ...bitsOf(parity, 8)]
  },
  fncFirst(): number[] {
    return bitsOf(5, 4)
  },
  fncSecond(indicator: number): number[] {
    return [...bitsOf(9, 4), ...bitsOf(indicator, 8)]
  },
}
