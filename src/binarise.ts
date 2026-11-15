/** A greyscale picture: one byte per pixel, 0 black to 255 white. */
export interface Luminance {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
}

/** A black-and-white picture: 1 for dark. */
export interface BitImage {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
}

/**
 * Greyscale from RGBA (4 bytes a pixel) or grey (1 byte a pixel) data, with
 * an optional row stride in pixels for padded camera planes. Transparent
 * pixels count as white, so a code drawn on a transparent canvas still reads.
 */
export function toLuminance(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 4,
  rowStride = width,
): Luminance {
  const out = new Uint8Array(width * height)
  if (channels === 1) {
    for (let y = 0; y < height; y++) out.set(data.subarray(y * rowStride, y * rowStride + width), y * width)
    return { data: out, width, height }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * rowStride + x) * 4
      const a = data[i + 3]!
      const grey = (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) >> 8
      // An opaque pixel is its own grey: (grey * 255 + 0) / 255.
      out[y * width + x] = a === 255 ? grey : (grey * a + 255 * (255 - a)) / 255
    }
  }
  return { data: out, width, height }
}

const BLOCK = 8
const MIN_DYNAMIC_RANGE = 24

/**
 * The binariser's thresholds: one an 8x8 block, `across` by `down`, or a
 * single one for the whole picture when it is under 40 pixels a side.
 */
export interface Thresholds {
  readonly across: number
  readonly down: number
  readonly values: Float64Array
}

/**
 * Local thresholds: each 8x8 block's threshold is the mean of the block
 * averages in the 5x5 blocks around it, and a flat block borrows its
 * neighbours' level, so shadows and gradients across the frame do not
 * swallow the code. Pictures under 40 pixels a side get one global threshold.
 */
export function thresholds(image: Luminance): Thresholds {
  const { data, width, height } = image
  if (width < 40 || height < 40) {
    let min = 255
    let max = 0
    for (const v of data) {
      if (v < min) min = v
      if (v > max) max = v
    }
    return { across: 1, down: 1, values: Float64Array.of(max - min < MIN_DYNAMIC_RANGE ? -1 : (min + max) / 2) }
  }
  const across = Math.ceil(width / BLOCK)
  const down = Math.ceil(height / BLOCK)
  const levels = new Float64Array(across * down)
  for (let by = 0; by < down; by++) {
    const top = Math.min(by * BLOCK, height - BLOCK)
    for (let bx = 0; bx < across; bx++) {
      const left = Math.min(bx * BLOCK, width - BLOCK)
      let sum = 0
      let min = 255
      let max = 0
      // In integers and without a branch a pixel: where v is under min, v - min
      // is negative and its sign fills the mask, so min takes the difference.
      for (let y = top; y < top + BLOCK; y++) {
        const row = y * width + left
        for (let i = row; i < row + BLOCK; i++) {
          const v = data[i]!
          sum = (sum + v) | 0
          const under = (v - min) | 0
          min = (min + (under & (under >> 31))) | 0
          const over = (max - v) | 0
          max = (max - (over & (over >> 31))) | 0
        }
      }
      let level = sum / (BLOCK * BLOCK)
      if (max - min <= MIN_DYNAMIC_RANGE) {
        // A flat block: assume it is background unless its neighbours say otherwise.
        level = min / 2
        if (bx > 0 && by > 0) {
          const around =
            (levels[(by - 1) * across + bx]! + 2 * levels[by * across + bx - 1]! + levels[(by - 1) * across + bx - 1]!) / 4
          if (min < around) level = around
        }
      }
      levels[by * across + bx] = level
    }
  }
  const values = new Float64Array(across * down)
  for (let by = 0; by < down; by++) {
    const cy = Math.min(Math.max(by, 2), down - 3)
    for (let bx = 0; bx < across; bx++) {
      const cx = Math.min(Math.max(bx, 2), across - 3)
      // At 40 pixels a side or more there are five blocks each way, so all 25 lie in the picture.
      let sum = 0
      for (let dy = -2; dy <= 2; dy++) {
        const row = (cy + dy) * across + cx
        for (let dx = -2; dx <= 2; dx++) sum += levels[row + dx]!
      }
      values[by * across + bx] = sum / 25
    }
  }
  return { across, down, values }
}

/**
 * The threshold binarise() applied at pixel (px, py), which must be in the
 * picture. The last block in a row or column covers the last 8 pixels, so it
 * overlaps the one before it and wins where they overlap.
 */
export function thresholdAt(t: Thresholds, width: number, height: number, px: number, py: number): number {
  if (t.across === 1 && t.down === 1) return t.values[0]!
  const bx = px >= width - BLOCK ? t.across - 1 : Math.floor(px / BLOCK)
  const by = py >= height - BLOCK ? t.down - 1 : Math.floor(py / BLOCK)
  return t.values[by * t.across + bx]!
}

/**
 * Local-threshold binarisation: 1 where a pixel is at or below its threshold.
 * `t` is the picture's thresholds(), for a caller that has them already.
 */
export function binarise(image: Luminance, t: Thresholds = thresholds(image)): BitImage {
  const { data, width, height } = image
  const out = new Uint8Array(width * height)
  // A pixel is a whole number, so it is at or below a threshold exactly when
  // it is under the next whole number above it: the sign of the difference.
  if (width < 40 || height < 40) {
    const above = Math.floor(t.values[0]!) + 1
    for (let i = 0; i < data.length; i++) out[i] = (data[i]! - above) >>> 31
    return { data: out, width, height }
  }
  for (let by = 0; by < t.down; by++) {
    const top = Math.min(by * BLOCK, height - BLOCK)
    for (let bx = 0; bx < t.across; bx++) {
      const left = Math.min(bx * BLOCK, width - BLOCK)
      const above = Math.floor(t.values[by * t.across + bx]!) + 1
      for (let y = top; y < top + BLOCK; y++) {
        const row = y * width + left
        for (let i = row; i < row + BLOCK; i++) out[i] = (data[i]! - above) >>> 31
      }
    }
  }
  return { data: out, width, height }
}

export function invert(image: BitImage): BitImage {
  const data = image.data
  const out = new Uint8Array(data.length)
  // Four pixels a step where the picture's bytes start on a word; the rest one by one.
  let i = 0
  if (data.byteOffset % 4 === 0) {
    const words = data.length >> 2
    const from = new Uint32Array(data.buffer, data.byteOffset, words)
    const to = new Uint32Array(out.buffer, 0, words)
    for (let w = 0; w < words; w++) to[w] = from[w]! ^ 0x01010101
    i = words << 2
  }
  for (; i < out.length; i++) out[i] = data[i]! ^ 1
  return { data: out, width: image.width, height: image.height }
}

/**
 * The picture shrunk by `f` (decoder step 9): floor(width / f) by
 * floor(height / f) pixels, each the mean of an f x f square, rounded as
 * (sum + floor(f * f / 2)) div (f * f). Columns and rows past the last whole
 * square are dropped.
 */
export function shrink(image: Luminance, f: number): Luminance {
  const width = Math.floor(image.width / f)
  const height = Math.floor(image.height / f)
  const out = new Uint8Array(width * height)
  const sums = new Uint32Array(width)
  const area = f * f
  const half = Math.floor(area / 2)
  for (let y = 0; y < height; y++) {
    sums.fill(0)
    for (let j = 0; j < f; j++) {
      const row = (y * f + j) * image.width
      for (let x = 0; x < width; x++) {
        let s = 0
        for (let i = 0; i < f; i++) s += image.data[row + x * f + i]!
        sums[x]! += s
      }
    }
    for (let x = 0; x < width; x++) out[y * width + x] = Math.floor((sums[x]! + half) / area)
  }
  return { data: out, width, height }
}

/** Sums of the 2 x 2 squares of a grid `width` by `height`: floor(width / 2) by floor(height / 2) of them. */
function quads(data: Uint8Array | Uint16Array, width: number, height: number): Uint16Array {
  const across = Math.floor(width / 2)
  const down = Math.floor(height / 2)
  const out = new Uint16Array(across * down)
  for (let y = 0; y < down; y++) {
    const upper = 2 * y * width
    const lower = upper + width
    const row = y * across
    for (let x = 0; x < across; x++) out[row + x] = data[upper + 2 * x]! + data[upper + 2 * x + 1]! + data[lower + 2 * x]! + data[lower + 2 * x + 1]!
  }
  return out
}

/**
 * shrink() for the factors 2, 4 and 8, from one pass over the picture: the
 * 2 x 2 sums, then sums of those, each made when first asked for. A square
 * of 4 is four squares of 2 and holds the same pixels, so the sums, and the
 * pictures, are the ones shrink() gives.
 */
export function reductions(image: Luminance): (f: 2 | 4 | 8) => Luminance {
  const sums: (Uint16Array | undefined)[] = []
  const level = (n: number): Uint16Array => {
    let s = sums[n]
    if (s === undefined) {
      const f = 1 << n
      s = n === 0 ? quads(image.data, image.width, image.height) : quads(level(n - 1), Math.floor(image.width / f), Math.floor(image.height / f))
      sums[n] = s
    }
    return s
  }
  return (f) => {
    const n = f === 2 ? 0 : f === 4 ? 1 : 2
    const s = level(n)
    const shift = 2 * (n + 1)
    const half = 1 << (shift - 1)
    const out = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) out[i] = (s[i]! + half) >> shift
    return { data: out, width: Math.floor(image.width / f), height: Math.floor(image.height / f) }
  }
}
