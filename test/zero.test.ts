import { describe, expect, it } from 'vitest'
import { blocksFor, Grid } from '../src/encode.js'
import { decode, decodeModules, encode, type ErrorCorrection } from '../src/index.js'
import { correctable, readSymbol } from '../src/symbol.js'

/**
 * A symbol whose every codeword is zero. Its data region shows the mask
 * pattern itself, as a checkerboard, stripes or a screen's moire can; all
 * zeros pass Reed-Solomon, and the first four bits read as a terminator.
 */
function zero(version: number, ecc: ErrorCorrection, mask: number): { modules: Uint8Array; size: number } {
  const [ec, g1, d1, g2] = blocksFor(version, ecc)
  const grid = new Grid(version)
  grid.placeData(new Uint8Array(g1 * d1 + g2 * (d1 + 1) + ec * (g1 + g2)))
  return { modules: grid.render(ecc, mask), size: grid.size }
}

/** Flips the first bit of the first `n` codewords of every block, walking the zigzag as the encoder does. */
function flipped(modules: Uint8Array, version: number, ecc: ErrorCorrection, n: number): Uint8Array {
  const m = modules.slice()
  const grid = new Grid(version)
  const s = grid.size
  const [, g1, , g2] = blocksFor(version, ecc)
  const limit = n * (g1 + g2)
  let bit = 0
  let upward = true
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < s; step++) {
      const y = upward ? s - 1 - step : step
      for (let i = 0; i < 2; i++) {
        const x = right - i
        if (grid.isReserved(x, y)) continue
        if (bit % 8 === 0 && bit / 8 < limit) m[y * s + x]! ^= 1
        bit++
      }
    }
    upward = !upward
  }
  return m
}

function transposed(modules: Uint8Array, size: number): Uint8Array {
  const t = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) t[x * size + y] = modules[y * size + x]!
  return t
}

/** Drawn straight, `scale` pixels a module, with four modules of quiet zone. */
function draw(modules: Uint8Array, size: number, scale: number, invert: boolean) {
  const side = (size + 8) * scale
  const data = new Uint8Array(side * side)
  for (let py = 0; py < side; py++) {
    for (let px = 0; px < side; px++) {
      const mx = Math.floor(px / scale) - 4
      const my = Math.floor(py / scale) - 4
      const dark = mx >= 0 && my >= 0 && mx < size && my < size && modules[my * size + mx] === 1
      data[py * side + px] = dark !== invert ? 0 : 255
    }
  }
  return { data, width: side, height: side }
}

const reader = (m: Uint8Array, size: number) => (x: number, y: number) => m[y * size + x] === 1

// One block; two sizes of block; version information and five blocks.
const CASES: readonly (readonly [number, ErrorCorrection])[] = [[1, 'L'], [1, 'M'], [1, 'Q'], [1, 'H'], [2, 'L'], [5, 'Q'], [7, 'H']]

describe('a symbol of nothing but zero codewords', () => {
  it('is built as meant: only the mask pattern in the data region, and whole format information', () => {
    for (let mask = 0; mask < 8; mask++) {
      const { modules, size } = zero(1, 'H', mask)
      const qr = encode('', { version: 1, ecc: 'H', mask })
      const grid = new Grid(1)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (grid.isReserved(x, y)) expect(modules[y * size + x], `${mask} ${x},${y}`).toBe(qr.modules[y * size + x])
        }
      }
    }
  })

  it('reads as nothing under every mask, undamaged and with every block damaged up to what it can correct', () => {
    for (const [version, ecc] of CASES) {
      const fixable = correctable(version, ecc)
      for (let mask = 0; mask < 8; mask++) {
        const { modules, size } = zero(version, ecc, mask)
        for (let n = 0; n <= fixable; n++) {
          const m = flipped(modules, version, ecc, n)
          expect(readSymbol(reader(m, size), size), `${version}${ecc} mask ${mask} flipped ${n}`).toBeUndefined()
        }
      }
    }
  })

  it('reads as nothing as modules, straight and mirrored', () => {
    for (const [version, ecc] of CASES) {
      const fixable = correctable(version, ecc)
      for (let mask = 0; mask < 8; mask++) {
        const { modules, size } = zero(version, ecc, mask)
        for (const n of [0, fixable]) {
          const m = flipped(modules, version, ecc, n)
          expect(decodeModules(m, size), `${version}${ecc} mask ${mask} flipped ${n}`).toBeUndefined()
          expect(decodeModules(transposed(m, size), size), `${version}${ecc} mask ${mask} flipped ${n} mirrored`).toBeUndefined()
        }
      }
    }
  })

  // Each of these is a whole search that finds nothing, so fewer cases than above.
  it('reads as nothing in a picture, dark on light and light on dark, straight and mirrored', () => {
    let turn = 0
    for (const [version, ecc] of [[1, 'H'], [2, 'L'], [5, 'Q']] as const) {
      const fixable = correctable(version, ecc)
      for (let mask = 0; mask < 8; mask++) {
        const { modules, size } = zero(version, ecc, mask)
        for (const invert of [false, true]) {
          for (const mirror of [false, true]) {
            const grid = mirror ? transposed(modules, size) : modules
            expect(decode(draw(grid, size, 6, invert)), `${version}${ecc} mask ${mask} inverted ${invert} mirrored ${mirror}`).toBeUndefined()
          }
        }
        const m = flipped(modules, version, ecc, fixable)
        const invert = (turn & 1) === 1
        const mirror = (turn & 2) === 2
        turn++
        expect(decode(draw(mirror ? transposed(m, size) : m, size, 6, invert)), `${version}${ecc} mask ${mask} flipped ${fixable} inverted ${invert} mirrored ${mirror}`).toBeUndefined()
      }
    }
  }, 60_000)

  it('leaves the picture readable: the same drawing with a real payload reads', () => {
    for (const [version, ecc] of CASES) {
      const qr = encode('0', { version, ecc, mask: 0 })
      expect(decode(draw(qr.modules, qr.size, 6, false))?.text, `${version}${ecc}`).toBe('0')
      expect(decode(draw(transposed(qr.modules, qr.size), qr.size, 6, true))?.text, `${version}${ecc} mirrored, inverted`).toBe('0')
    }
  })
})

describe('payloads that are empty or hold zero bytes', () => {
  it('reads an empty string and an empty byte array back as empty', () => {
    for (const data of ['', new Uint8Array(0)]) {
      for (const [version, ecc] of CASES) {
        const qr = encode(data, { version, ecc })
        const got = readSymbol(reader(qr.modules, qr.size), qr.size)
        expect(got, `${version}${ecc}`).toMatchObject({ text: '', version, ecc, corrected: 0 })
        expect(got!.bytes.length).toBe(0)
        expect(decode(draw(qr.modules, qr.size, 6, false))?.text, `${version}${ecc} drawn`).toBe('')
      }
    }
  })

  it('reads zero bytes back, in a symbol where they leave whole blocks zero', () => {
    for (const [version, ecc, length] of [[1, 'L', 17], [5, 'Q', 60], [7, 'H', 64]] as const) {
      const bytes = new Uint8Array(length)
      const qr = encode(bytes, { version, ecc })
      const got = readSymbol(reader(qr.modules, qr.size), qr.size)
      expect(got?.bytes, `${version}${ecc}`).toEqual(bytes)
      expect(decode(draw(qr.modules, qr.size, 6, false))?.bytes, `${version}${ecc} drawn`).toEqual(bytes)
    }
  })
})
