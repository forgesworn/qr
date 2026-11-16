import { describe, expect, it } from 'vitest'
import { decode } from '../src/decode.js'
import { encode } from '../src/encode.js'
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
