// jsQR is a development-only oracle: an independent reader must decode what
// we encode. It is never a dependency of the package.
import jsQRModule from 'jsqr'
import { describe, expect, it } from 'vitest'
import { encode, type ErrorCorrection, type QrCode } from '../src/index.js'

// jsqr is CommonJS whose types declare an ES default; under NodeNext the
// default import types as the module object, while Vitest hands us the function.
const jsQR = jsQRModule as unknown as typeof jsQRModule.default

function rgba(qr: QrCode, scale = 4, margin = 4): { data: Uint8ClampedArray; side: number } {
  const side = (qr.size + margin * 2) * scale
  const data = new Uint8ClampedArray(side * side * 4).fill(255)
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y * qr.size + x] !== 1) continue
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const p = (((y + margin) * scale + dy) * side + (x + margin) * scale + dx) * 4
          data[p] = data[p + 1] = data[p + 2] = 0
        }
      }
    }
  }
  return { data, side }
}

function read(qr: QrCode): number[] | undefined {
  const { data, side } = rgba(qr)
  return jsQR(data, side, side, { inversionAttempts: 'dontInvert' })?.binaryData
}

const LEVELS: ErrorCorrection[] = ['L', 'M', 'Q', 'H']

function prng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('jsQR reads what we encode', () => {
  const rand = prng(20261114)
  const alphabets = ['0123456789', '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:', 'abcdefghijklmnopqrstuvwxyz:/?#=&-_.~0123456789']
  for (let i = 0; i < 120; i++) {
    const alphabet = alphabets[i % 3]!
    const length = 1 + Math.floor(rand() ** 2 * 900)
    let text = ''
    for (let k = 0; k < length; k++) text += alphabet[Math.floor(rand() * alphabet.length)]
    const ecc = LEVELS[i % 4]!
    it(`random ${i}: ${length} chars, ${ecc}`, () => {
      let qr: QrCode
      try {
        qr = encode(text, { ecc })
      } catch {
        return // too long at this level: capacity is covered elsewhere
      }
      expect(read(qr)).toEqual([...new TextEncoder().encode(text)])
    })
  }

  it('reads UTF-8 text with and without an ECI designator', () => {
    const text = 'KithMoot café ☕ 会議'
    for (const eci of [false, true]) {
      expect(read(encode(text, { eci }))).toEqual([...new TextEncoder().encode(text)])
    }
  })

  it('reads every mask at version 1 and 7', () => {
    for (const version of [1, 7]) {
      for (let mask = 0; mask < 8; mask++) {
        expect(read(encode('HELLO WORLD', { version, mask, ecc: 'Q' }))).toEqual([...new TextEncoder().encode('HELLO WORLD')])
      }
    }
  })

  it('reads mixed segments, with and without the ECI designator', () => {
    const runs = ['abcdefghxyz-._~?=&', '0123456789', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:', 'éü☕会😀']
    let mixed = 0
    for (let i = 0; i < 80; i++) {
      let text = ''
      const length = 1 + Math.floor(rand() ** 2 * 1200)
      while (text.length < length) {
        const set = runs[Math.floor(rand() * runs.length)]!
        for (let k = 1 + Math.floor(rand() * 30); k > 0; k--) text += Array.from(set)[Math.floor(rand() * Array.from(set).length)]
      }
      const ecc = LEVELS[i % 4]!
      let qr: QrCode
      try {
        qr = encode(text, { ecc, eci: i % 2 === 1 })
      } catch {
        continue
      }
      if (qr.segments.length > 1) mixed++
      expect(read(qr), `${i}: ${qr.segments.length} segments, v${qr.version}${ecc}`).toEqual([...new TextEncoder().encode(text)])
    }
    expect(mixed).toBeGreaterThan(50)
  })

  it('reads payment-URI shapes encoded as mixed segments', () => {
    const bech32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
    const pick = (n: number) => Array.from({ length: n }, () => bech32[Math.floor(rand() * 32)]).join('').toUpperCase()
    for (const text of [
      `lightning:LNBC2500U1P${pick(330)}`,
      `bitcoin:BC1Q${pick(38)}?amount=0.00025000&lightning=LNBC2500U1P${pick(330)}`,
      `lightning:LNURL1${pick(180)}`,
      'https://id.example.com/01/09506000134352/10/ABC123/21/000000012345',
    ]) {
      for (const ecc of LEVELS) {
        const qr = encode(text, { ecc })
        expect(qr.segments.length).toBeGreaterThan(1)
        expect(read(qr)).toEqual([...new TextEncoder().encode(text)])
      }
    }
  })

  it('reads arbitrary bytes', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    expect(read(encode(bytes, { ecc: 'L' }))).toEqual([...bytes])
  })
})
