// Synthetic photographs of QR codes for the decoder tests.

export function prng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

export interface Shot {
  /** Pixels a module, along the bottom edge. */
  scale: number
  /** Degrees. */
  angle?: number
  /** How much narrower the top edge is than the bottom, 0 to 1. */
  perspective?: number
  margin?: number
  /** Uniform noise, plus or minus this many grey levels. */
  noise?: number
  /** Box blur radius in pixels. */
  blur?: number
  /** Light falls from 1 on the right to this on the left. */
  shade?: number
  /** Light modules on dark. */
  invert?: boolean
  /** Draw the grid transposed. */
  mirror?: boolean
  seed?: number
}

export interface Grey { data: Uint8Array; width: number; height: number }

type Pt = { x: number; y: number }

/** The projective map from the unit square to a quadrilateral, and its inverse. */
function homography(q: readonly Pt[]): { forward: (x: number, y: number) => Pt; inverse: (x: number, y: number) => Pt } {
  const [p0, p1, p2, p3] = q as [Pt, Pt, Pt, Pt]
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y
  const den = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / den
  const h = (dx1 * dy3 - dx3 * dy1) / den
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y
  // Inverse by the adjugate.
  const A = e - f * h, B = c * h - b, C = b * f - c * e
  const D = f * g - d, E = a - c * g, F = c * d - a * f
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d
  return {
    forward: (x, y) => {
      const w = g * x + h * y + 1
      return { x: (a * x + b * y + c) / w, y: (d * x + e * y + f) / w }
    },
    inverse: (x, y) => {
      const w = G * x + H * y + I
      return { x: (A * x + B * y + C) / w, y: (D * x + E * y + F) / w }
    },
  }
}

/** Where module-space points land in the picture a shot takes. */
export function frame(size: number, shot: Shot) {
  const margin = shot.margin ?? 4
  const side = size + 2 * margin
  const half = (side * shot.scale) / 2
  const angle = ((shot.angle ?? 0) * Math.PI) / 180
  const narrow = 1 - (shot.perspective ?? 0)
  const reach = Math.ceil(half * Math.SQRT2) + 4
  const turn = (x: number, y: number): Pt => ({
    x: reach + x * Math.cos(angle) - y * Math.sin(angle),
    y: reach + x * Math.sin(angle) + y * Math.cos(angle),
  })
  const map = homography([turn(-half * narrow, -half), turn(half * narrow, -half), turn(half, half), turn(-half, half)])
  return {
    margin,
    side,
    width: 2 * reach,
    height: 2 * reach,
    inverse: map.inverse,
    /** Picture point of module-space point (x, y), measured from the symbol's top-left corner. */
    at: (x: number, y: number): Pt => map.forward((x + margin) / side, (y + margin) / side),
  }
}

export function photograph(modules: Uint8Array, size: number, shot: Shot): Grey {
  const { margin, side, width, height, inverse } = frame(size, shot)
  const dark = (u: number, v: number): boolean => {
    const mx = Math.floor(u * side) - margin
    const my = Math.floor(v * side) - margin
    if (mx < 0 || my < 0 || mx >= size || my >= size) return false
    return modules[shot.mirror ? mx * size + my : my * size + mx] === 1
  }
  const light = shot.invert ? 30 : 225
  const ink = shot.invert ? 225 : 30
  const random = prng(shot.seed ?? 1)
  let data: Uint8Array = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const p = inverse(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)
          const inside = p.x >= 0 && p.x < 1 && p.y >= 0 && p.y < 1
          sum += inside && dark(p.x, p.y) ? ink : inside ? light : shot.invert ? light : 200
        }
      }
      data[y * width + x] = sum / 9
    }
  }
  if (shot.blur) data = boxBlur(data, width, height, shot.blur)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const lit = shot.shade === undefined ? 1 : shot.shade + ((1 - shot.shade) * x) / width
      const noise = shot.noise ? (random() * 2 - 1) * shot.noise : 0
      data[i] = Math.max(0, Math.min(255, Math.round(data[i]! * lit + noise)))
    }
  }
  return { data, width, height }
}

function boxBlur(data: Uint8Array, width: number, height: number, r: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let n = 0
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
          sum += data[yy * width + xx]!
          n++
        }
      }
      out[y * width + x] = sum / n
    }
  }
  return out
}

export function toRgba(image: Grey): Uint8ClampedArray {
  const out = new Uint8ClampedArray(image.width * image.height * 4)
  for (let i = 0; i < image.data.length; i++) {
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = image.data[i]!
    out[i * 4 + 3] = 255
  }
  return out
}

