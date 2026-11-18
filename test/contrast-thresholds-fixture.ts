// Small, faint codes on flat paper, read only by the terminal contrast-threshold
// search, a faint decoy that the search examines and must refuse, and a faint
// code with a spoiled format copy that the search's format gate must refuse.
import { encode, type ErrorCorrection } from '../src/encode.js'
import { photograph, type Grey } from './photo.js'

export type ContrastName = 'dark' | 'light' | 'second-look' | 'decoy' | 'format-gate'

interface Spec {
  text: string
  version: number
  ecc: ErrorCorrection
  scale: number
  angle: number
  blur: number
  /** How much of the photograph's 30..225 range survives. */
  keep: number
  light: number
  invert: boolean
}

const SPECS: Record<Exclude<ContrastName, 'decoy' | 'format-gate'>, Spec> = {
  dark: { text: 'https://example.com/c2d', version: 2, ecc: 'M', scale: 1.9, angle: 12, blur: 0, keep: 0.24, light: 200, invert: false },
  light: { text: 'https://example.com/c3l', version: 3, ecc: 'M', scale: 1.9, angle: 31, blur: 0, keep: 0.24, light: 205, invert: true },
  'second-look': { text: 'https://example.com/c2d', version: 2, ecc: 'M', scale: 2.2, angle: 0, blur: 1, keep: 0.24, light: 200, invert: false },
}

/** Finder patterns, timing patterns and seeded random modules: symbol-like, but no symbol. */
function decoyModules(size: number): Uint8Array {
  const modules = new Uint8Array(size * size)
  let s = 0x5eed
  for (let i = 0; i < modules.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    modules[i] = s >>> 31
  }
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      const px = ox + x, py = oy + y
      if (px < 0 || py < 0 || px >= size || py >= size) continue
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3))
      modules[py * size + px] = ring === 2 || ring === 4 ? 0 : 1
    }
  }
  for (let i = 8; i < size - 8; i++) modules[6 * size + i] = modules[i * size + 6] = i % 2 === 0 ? 1 : 0
  return modules
}

/** The photograph's range compressed towards `light`, then padded with flat paper. */
function faint(image: Grey, spec: Pick<Spec, 'keep' | 'light' | 'invert'>, pad: number): Grey {
  const tone = (v: number): number => Math.round(spec.light - (225 - v) * spec.keep)
  const width = image.width + 2 * pad
  const height = image.height + 2 * pad
  const data = new Uint8Array(width * height).fill(tone(spec.invert ? 30 : 200))
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) data[(y + pad) * width + x + pad] = tone(image.data[y * image.width + x]!)
  }
  return { data, width, height }
}

export function contrastPicture(name: ContrastName): { image: Grey; text?: string; version?: number; ecc?: ErrorCorrection; inverted?: boolean } {
  if (name === 'decoy') {
    const size = 25
    const shot = photograph(decoyModules(size), size, { scale: 1.9, angle: 12, margin: 2 })
    return { image: faint(shot, { keep: 0.24, light: 200, invert: false }, 16) }
  }
  const spec = SPECS[name === 'format-gate' ? 'dark' : name]
  const qr = encode(spec.text, { version: spec.version, ecc: spec.ecc })
  const modules = qr.modules.slice()
  // Four bits of the first format copy (row 8, left of the finder) flipped:
  // beyond the two bits the gate allows, while the second copy is intact.
  if (name === 'format-gate') for (let x = 0; x < 4; x++) modules[8 * qr.size + x]! ^= 1
  const shot = photograph(modules, qr.size, { scale: spec.scale, angle: spec.angle, blur: spec.blur, invert: spec.invert, margin: 2 })
  const image = faint(shot, spec, 16)
  if (name === 'format-gate') return { image }
  return { image, text: spec.text, version: spec.version, ecc: spec.ecc, inverted: spec.invert }
}
