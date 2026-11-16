import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decode } from '../src/decode.js'
import { encode } from '../src/encode.js'
import { loadWasm } from '../src/wasm.js'
import { photograph, prng } from './photo.js'

const text = 'https://example.com/finder-damage/0123456789'

/** Damage the same randomly chosen modules in all three finder patterns. */
function damagedFinders(flips: number, seed: number, timingFlips = 0) {
  const qr = encode(text, { ecc: 'H' })
  const modules = qr.modules.slice()
  const random = prng(seed * 971 + flips)
  const order = Array.from({ length: 49 }, (_, i) => i)
  for (let i = 0; i < flips; i++) {
    const j = i + Math.floor(random() * (49 - i))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
    const x = order[i]! % 7
    const y = Math.floor(order[i]! / 7)
    for (const [ox, oy] of [[0, 0], [qr.size - 7, 0], [0, qr.size - 7]] as const) {
      modules[(y + oy) * qr.size + x + ox]! ^= 1
    }
  }
  for (let i = 0; i < timingFlips; i++) {
    const c = 8 + i
    modules[6 * qr.size + c]! ^= 1
    modules[c * qr.size + 6]! ^= 1
  }
  return photograph(modules, qr.size, { scale: 4, angle: 17, shade: 0.7 })
}

describe('damaged finder patterns', () => {
  it.each([[1, 4], [1, 5], [2, 4], [2, 5]])('reads %i-pixel finder centres with quiet margin %i', async (centreHeight, padding) => {
    const qr = encode('A', { version: 1, ecc: 'H' })
    const side = qr.size + 2 * padding
    const data = new Uint8Array(side * side).fill(235)
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y * qr.size + x]) data[(y + padding) * side + x + padding] = 20
    }
    for (const [ox, oy] of [[0, 0], [qr.size - 7, 0], [0, qr.size - 7]] as const) {
      // Keep the middle row and, for height two, one dark pixel above it.
      // Extend the bottom border into the separator without changing payload.
      for (const y of [2, 4]) for (let x = 2; x <= 4; x++) data[(padding + oy + y) * side + padding + ox + x] = 235
      if (centreHeight === 2) data[(padding + oy + 2) * side + padding + ox + 3] = 20
      for (let x = 0; x <= 6; x++) data[(padding + oy + 7) * side + padding + ox + x] = 20
    }
    const image = { data, width: side, height: side }
    const wasm = await loadWasm(readFileSync(new URL('../wasm/qr.wasm', import.meta.url)))
    try {
      for (const result of [decode(image), wasm.decode(image)]) {
        expect(result?.text).toBe('A')
        expect(result?.bytes).toEqual(new Uint8Array([65]))
      }
    } finally { wasm.dispose() }
  })

  it.each([[5, 10], [4, 11], [4, 12]])('reads all three damaged finders with %i flips and seed %i', (flips, seed) => {
    const found = decode(damagedFinders(flips, seed))
    expect(found?.text).toBe(text)
    expect(found?.bytes).toEqual(new TextEncoder().encode(text))
  })

  it('reads damaged finders when both timing patterns are damaged too', () => {
    const found = decode(damagedFinders(5, 10, 10))
    expect(found?.text).toBe(text)
    expect(found?.bytes).toEqual(new TextEncoder().encode(text))
  })
})
