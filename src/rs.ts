import { EXP, gfMul, LOG } from './encode.js'

// Reed-Solomon error correction for QR codes: GF(256) with 0x11D, generator
// roots α^0 .. α^(ecCount - 1). Polynomials here are lowest power first,
// except `block`, which is a received codeword block, highest power first.

function gfDiv(a: number, b: number): number {
  if (b === 0) throw new RangeError('Division by zero in GF(256)')
  return a === 0 ? 0 : EXP[(LOG[a]! + 255 - LOG[b]!) % 255]!
}

function evaluate(poly: readonly number[], x: number): number {
  let y = 0
  for (let i = poly.length - 1; i >= 0; i--) y = gfMul(y, x) ^ poly[i]!
  return y
}

// QR blocks have at most 30 check codewords, so at most 30 syndrome roots.
// Row j multiplies every byte by α^j, so each syndrome step is one lookup.
const SYNDROME_ROOTS = 30
const SYNDROME_MUL = new Uint8Array(SYNDROME_ROOTS * 256)
for (let j = 0; j < SYNDROME_ROOTS; j++) {
  for (let a = 1; a < 256; a++) SYNDROME_MUL[j * 256 + a] = EXP[LOG[a]! + j]!
}

/**
 * Corrects `block` (data codewords then `ecCount` check codewords) in place.
 * Returns the number of codewords corrected, or -1 when the block has more
 * errors than the code can correct.
 */
export function correct(block: Uint8Array, ecCount: number): number {
  const n = block.length
  const syndromes: number[] = []
  let clean = true
  for (let j = 0; j < ecCount; j++) {
    let s = 0
    if (j < SYNDROME_ROOTS) {
      const row = j * 256
      for (let i = 0; i < n; i++) s = SYNDROME_MUL[row + s]! ^ block[i]!
    } else {
      const x = EXP[j]!
      for (let i = 0; i < n; i++) s = gfMul(s, x) ^ block[i]!
    }
    syndromes.push(s)
    if (s !== 0) clean = false
  }
  if (clean) return 0

  // Berlekamp-Massey: the error locator Λ.
  let locator = [1]
  let previous = [1]
  let errors = 0
  let shift = 1
  let lastDiscrepancy = 1
  for (let k = 0; k < ecCount; k++) {
    let d = syndromes[k]!
    for (let i = 1; i <= errors; i++) d ^= gfMul(locator[i] ?? 0, syndromes[k - i]!)
    if (d === 0) {
      shift++
      continue
    }
    const factor = gfDiv(d, lastDiscrepancy)
    const next = locator.slice()
    for (let i = 0; i < previous.length; i++) {
      const at = i + shift
      while (next.length <= at) next.push(0)
      next[at]! ^= gfMul(factor, previous[i]!)
    }
    if (2 * errors <= k) {
      previous = locator
      errors = k + 1 - errors
      lastDiscrepancy = d
      shift = 1
    } else {
      shift++
    }
    locator = next
  }
  while (locator.length > 1 && locator[locator.length - 1] === 0) locator.pop()
  if (errors * 2 > ecCount || locator.length - 1 !== errors) return -1

  // Chien search: a root at α^-p marks an error at power p, index n - 1 - p.
  const powers: number[] = []
  for (let p = 0; p < n; p++) {
    if (evaluate(locator, EXP[(255 - p) % 255]!) === 0) powers.push(p)
  }
  if (powers.length !== errors) return -1

  // Forney: Ω = S·Λ mod x^ecCount; e = X·Ω(X⁻¹) / Λ'(X⁻¹) for first root α^0.
  const omega = new Array<number>(ecCount).fill(0)
  for (let i = 0; i < ecCount; i++) {
    for (let j = 0; j < locator.length && i + j < ecCount; j++) omega[i + j]! ^= gfMul(syndromes[i]!, locator[j]!)
  }
  const derivative: number[] = []
  for (let i = 1; i < locator.length; i++) derivative.push(i % 2 === 1 ? locator[i]! : 0)
  for (const p of powers) {
    const x = EXP[p % 255]!
    const xInverse = EXP[(255 - p) % 255]!
    const denominator = evaluate(derivative, xInverse)
    if (denominator === 0) return -1
    block[n - 1 - p]! ^= gfMul(x, gfDiv(evaluate(omega, xInverse), denominator))
  }
  return errors
}
