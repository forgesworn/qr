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
      out[y * width + x] = (grey * a + 255 * (255 - a)) / 255
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
      for (let y = top; y < top + BLOCK; y++) {
        for (let x = left; x < left + BLOCK; x++) {
          const v = data[y * width + x]!
          sum += v
          if (v < min) min = v
          if (v > max) max = v
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
      let sum = 0
      let n = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const yy = cy + dy
          const xx = cx + dx
          if (yy < 0 || xx < 0 || yy >= down || xx >= across) continue
          sum += levels[yy * across + xx]!
          n++
        }
      }
      values[by * across + bx] = sum / n
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

/** Local-threshold binarisation (thresholds()): 1 where a pixel is at or below its threshold. */
export function binarise(image: Luminance): BitImage {
  const { data, width, height } = image
  const out = new Uint8Array(width * height)
  const t = thresholds(image)
  if (width < 40 || height < 40) {
    const threshold = t.values[0]!
    for (let i = 0; i < data.length; i++) out[i] = data[i]! <= threshold ? 1 : 0
    return { data: out, width, height }
  }
  for (let by = 0; by < t.down; by++) {
    const top = Math.min(by * BLOCK, height - BLOCK)
    for (let bx = 0; bx < t.across; bx++) {
      const left = Math.min(bx * BLOCK, width - BLOCK)
      const threshold = t.values[by * t.across + bx]!
      for (let y = top; y < top + BLOCK; y++) {
        for (let x = left; x < left + BLOCK; x++) out[y * width + x] = data[y * width + x]! <= threshold ? 1 : 0
      }
    }
  }
  return { data: out, width, height }
}

export function invert(image: BitImage): BitImage {
  const out = new Uint8Array(image.data.length)
  for (let i = 0; i < out.length; i++) out[i] = image.data[i]! ^ 1
  return { data: out, width: image.width, height: image.height }
}
