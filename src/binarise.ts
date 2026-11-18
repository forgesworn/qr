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
  storage?: Uint8Array,
): Luminance {
  const out = storage ?? new Uint8Array(width * height)
  if (channels === 1) {
    for (let y = 0; y < height; y++) out.set(data.subarray(y * rowStride, y * rowStride + width), y * width)
    return { data: out, width, height }
  }
  if (LITTLE_ENDIAN && data.byteOffset % 4 === 0) {
    // One load a pixel: on a little-endian host the word is a | b | g | r from
    // its high byte down, so each channel is the same byte the loop below reads.
    const words = new Uint32Array(data.buffer, data.byteOffset, data.length >>> 2)
    for (let y = 0; y < height; y++) {
      let w = y * rowStride
      let o = y * width
      for (let end = o + width; o < end; o++, w++) {
        const v = words[w]!
        const a = v >>> 24
        const grey = ((v & 255) * 77 + ((v >>> 8) & 255) * 150 + ((v >>> 16) & 255) * 29) >> 8
        out[o] = a === 255 ? grey : (grey * a + 255 * (255 - a)) / 255
      }
    }
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

/** Typed arrays use the host's byte order; the word path above assumes little-endian. */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1

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
  /** Flat local blocks in a picture with enough overall contrast to justify re-thresholding its inverse. */
  readonly invertedFallback: boolean
  /** Every luminance value is identical, so neither this picture nor its reductions can contain a symbol. */
  readonly uniform: boolean
}

/** Each 8x8 block's own level, which blocks were flat, and the picture's range. */
export interface BlockLevels {
  readonly across: number
  readonly down: number
  readonly levels: Float64Array
  readonly flats: Uint8Array
  readonly flat: boolean
  readonly pictureMin: number
  readonly pictureMax: number
}

/**
 * A block's level is its mean, or for a flat block (range at most 24) half its
 * minimum, raised to its earlier neighbours' level when its minimum is below
 * that. Undefined under 40 pixels a side, where one global threshold serves.
 */
export function levelBlocks(image: Luminance): BlockLevels | undefined {
  const { data, width, height } = image
  if (width < 40 || height < 40) return undefined
  const across = Math.ceil(width / BLOCK)
  const down = Math.ceil(height / BLOCK)
  const levels = new Float64Array(across * down)
  const flats = new Uint8Array(across * down)
  let flat = false
  let pictureMin = 255
  let pictureMax = 0
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
        // Once the range is wide enough it cannot become flat again. Only
        // the sum affects this block's threshold from here on.
        if (max - min > MIN_DYNAMIC_RANGE) {
          for (let i = row; i < row + BLOCK; i++) sum = (sum + data[i]!) | 0
          continue
        }
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
      pictureMin = Math.min(pictureMin, min)
      pictureMax = Math.max(pictureMax, max)
      if (max - min <= MIN_DYNAMIC_RANGE) {
        flat = true
        flats[by * across + bx] = 1
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
  return { across, down, levels, flats, flat, pictureMin, pictureMax }
}

/**
 * Local thresholds: each 8x8 block's threshold is the mean of the block
 * averages in the 5x5 blocks around it, and a flat block borrows its
 * neighbours' level, so shadows and gradients across the frame do not
 * swallow the code. Pictures under 40 pixels a side get one global threshold.
 * `blocks` is levelBlocks(image), for a caller that has it already.
 */
export function thresholds(image: Luminance, blocks: BlockLevels | undefined = levelBlocks(image)): Thresholds {
  if (!blocks) {
    let min = 255
    let max = 0
    for (const v of image.data) {
      if (v < min) min = v
      if (v > max) max = v
    }
    return { across: 1, down: 1, values: Float64Array.of(max - min < MIN_DYNAMIC_RANGE ? -1 : (min + max) / 2), invertedFallback: false, uniform: min === max }
  }
  const { across, down, levels, flat, pictureMin, pictureMax } = blocks
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
  return { across, down, values, invertedFallback: flat && pictureMax - pictureMin > MIN_DYNAMIC_RANGE, uniform: pictureMin === pictureMax }
}

/**
 * thresholds() with the flat blocks left out of every 5x5 average that also
 * holds a block with contrast. A flat block's level is a guess at background,
 * often half its minimum, and beside a small or faint code it drags the
 * threshold below the code's own dark modules. Averages of only flat or only
 * contrasted blocks are unchanged. `blocks` is levelBlocks(image). Undefined
 * when no changed threshold puts any of its block's 64 pixels on the other
 * side, as the binary picture would be the same; in particular without both a
 * flat block and over 24 levels of range in the picture.
 */
export function contrastThresholds(image: Luminance, blocks: BlockLevels): Thresholds | undefined {
  const { data, width, height } = image
  const { across, down, levels, flats, flat, pictureMin, pictureMax } = blocks
  if (!flat || pictureMax - pictureMin <= MIN_DYNAMIC_RANGE) return undefined
  const values = new Float64Array(across * down)
  let changes = false
  for (let by = 0; by < down; by++) {
    const cy = Math.min(Math.max(by, 2), down - 3)
    const top = Math.min(by * BLOCK, height - BLOCK)
    for (let bx = 0; bx < across; bx++) {
      const cx = Math.min(Math.max(bx, 2), across - 3)
      let sum = 0
      let contrastSum = 0
      let contrasted = 0
      for (let dy = -2; dy <= 2; dy++) {
        const row = (cy + dy) * across + cx
        for (let dx = -2; dx <= 2; dx++) {
          const level = levels[row + dx]!
          sum += level
          if (flats[row + dx] === 0) {
            contrastSum += level
            contrasted++
          }
        }
      }
      const before = sum / 25
      if (contrasted === 0 || contrasted === 25) {
        values[by * across + bx] = before
        continue
      }
      const after = contrastSum / contrasted
      values[by * across + bx] = after
      // A whole-number pixel is dark at or below floor(threshold), so it
      // changes side exactly when it lies above the lower floor and at or
      // below the higher one.
      if (changes) continue
      const low = Math.floor(Math.min(before, after))
      const high = Math.floor(Math.max(before, after))
      if (low === high) continue
      const left = Math.min(bx * BLOCK, width - BLOCK)
      for (let y = top; y < top + BLOCK && !changes; y++) {
        for (let i = y * width + left; i < y * width + left + BLOCK; i++) {
          const v = data[i]!
          if (v > low && v <= high) {
            changes = true
            break
          }
        }
      }
    }
  }
  if (!changes) return undefined
  return { across, down, values, invertedFallback: true, uniform: false }
}

/** Invert luminance before thresholding: flat-block background estimates depend on polarity. */
export function invertLuminance(image: Luminance): Luminance {
  const data = new Uint8Array(image.data.length)
  for (let i = 0; i < data.length; i++) data[i] = 255 - image.data[i]!
  return { data, width: image.width, height: image.height }
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

/** Bilinear enlargement by an integer factor, with pixel centres at i + 0.5. */
export function enlarge(image: Luminance, f: number): Luminance {
  if (f === 4 && image.width > 0 && image.height > 0) return enlargeFour(image)
  const width = image.width * f
  const height = image.height * f
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const fy = (y + 0.5) / f - 0.5
    const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(fy)))
    const y1 = Math.min(image.height - 1, y0 + 1)
    const ay = Math.max(0, Math.min(1, fy - y0))
    for (let x = 0; x < width; x++) {
      const fx = (x + 0.5) / f - 0.5
      const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(fx)))
      const x1 = Math.min(image.width - 1, x0 + 1)
      const ax = Math.max(0, Math.min(1, fx - x0))
      const top = image.data[y0 * image.width + x0]! * (1 - ax) + image.data[y0 * image.width + x1]! * ax
      const bottom = image.data[y1 * image.width + x0]! * (1 - ax) + image.data[y1 * image.width + x1]! * ax
      data[y * width + x] = Math.round(top * (1 - ay) + bottom * ay)
    }
  }
  return { data, width, height }
}

/** At 4x, the interior weights are eighths in both axes. Keep two horizontal
 * rows in eighths and round only after both interpolations. */
function enlargeFour(image: Luminance): Luminance {
  const width = image.width * 4
  const height = image.height * 4
  const data = new Uint8Array(width * height)
  let top = new Uint16Array(width)
  let bottom = new Uint16Array(width)
  const horizontal = (out: Uint16Array, start: number) => {
    let left = image.data[start]!
    out[0] = out[1] = left * 8
    for (let x = 1, i = 2; x < image.width; x++, i += 4) {
      const right = image.data[start + x]!
      const step = 2 * (right - left)
      const first = 7 * left + right
      out[i] = first
      out[i + 1] = first + step
      out[i + 2] = first + 2 * step
      out[i + 3] = first + 3 * step
      left = right
    }
    out[width - 2] = out[width - 1] = left * 8
  }
  const clampedRows = (start: number) => {
    for (let x = 0; x < width; x++) data[start + x] = (top[x]! + 4) >> 3
    data.copyWithin(start + width, start, start + width)
  }
  horizontal(top, 0)
  clampedRows(0)
  for (let y = 1; y < image.height; y++) {
    horizontal(bottom, y * image.width)
    const row0 = (4 * y - 2) * width
    const row1 = row0 + width, row2 = row1 + width, row3 = row2 + width
    for (let x = 0; x < width; x++) {
      const a = top[x]!, b = bottom[x]!
      const step = 2 * (b - a)
      // The denominator is 64, so adding 32 gives half-up rounding.
      const first = 7 * a + b + 32
      data[row0 + x] = first >> 6
      data[row1 + x] = (first + step) >> 6
      data[row2 + x] = (first + 2 * step) >> 6
      data[row3 + x] = (first + 3 * step) >> 6
    }
    const swap = top
    top = bottom
    bottom = swap
  }
  clampedRows((height - 2) * width)
  return { data, width, height }
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
