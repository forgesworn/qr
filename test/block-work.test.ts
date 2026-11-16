import { expect, it } from 'vitest'
import { encode, Grid } from '../src/encode.js'
import { readSymbol } from '../src/symbol.js'

it('rejects a failed early error-correction block without reading the rest of a large symbol', () => {
  const qr = encode('https://example.com/damaged', { version: 40 })
  const grid = new Grid(qr.version)
  let seed = 42
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    if (grid.isReserved(x, y)) continue
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    qr.modules[y * qr.size + x] = seed >>> 31
  }
  let reads = 0
  const result = readSymbol((x, y) => {
    reads++
    return qr.modules[y * qr.size + x] === 1
  }, qr.size)
  expect(result).toBeUndefined()
  // Headers and one block, instead of all 29,648 stream bits.
  expect(reads).toBeLessThan(1024)
})
