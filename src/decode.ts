import { binarise, invert, toLuminance, type BitImage } from './binarise.js'
import { finderTriples, findFinders, locate, type Location, type Point, type Work } from './locate.js'
import { readSymbol, type ModuleReader, type Payload } from './symbol.js'

/** Pixels to read: RGBA (4 bytes a pixel, as ImageData gives) or greyscale (1 byte a pixel). */
export interface ImageLike {
  readonly data: Uint8Array | Uint8ClampedArray
  readonly width: number
  readonly height: number
}

export interface DecodeOptions {
  /** Pixels from the start of one row to the next, for padded camera planes. Default: width. */
  readonly rowStride?: number
  /** Bytes a pixel. Default: worked out from the data length. */
  readonly channels?: 1 | 4
  /** Which way round to look for dark modules. Default 'both': dark on light first, then light on dark. */
  readonly inversion?: 'normal' | 'inverted' | 'both'
}

/** A symbol found in a picture. */
export interface DecodeResult extends Payload {
  /** The symbol was mirrored (read transposed). */
  readonly mirrored: boolean
  /** The symbol was light on dark. */
  readonly inverted: boolean
  /** Picture coordinates of the finder pattern centres, and of the alignment pattern if one was used. */
  readonly location: {
    readonly topLeft: Point
    readonly topRight: Point
    readonly bottomLeft: Point
    readonly alignment: Point | undefined
  }
}

const MAX_TRIPLES = 6

function channelsFor(image: ImageLike, stride: number, given: 1 | 4 | undefined): 1 | 4 {
  const { data, width, height } = image
  const last = stride * (height - 1) + width
  if (given !== undefined && given !== 1 && given !== 4) throw new RangeError('channels must be 1 or 4')
  const channels = given ?? (data.length >= last * 4 ? 4 : 1)
  if (data.length < last * channels) throw new RangeError(`The data is too short for a ${width}x${height} picture`)
  return channels
}

/**
 * Finds and reads one QR code in a picture. Returns undefined when no
 * readable code is found.
 */
export function decode(image: ImageLike, options: DecodeOptions = {}): DecodeResult | undefined {
  return decodeCounted(image, options)
}

/** As decode(), counting the search's work into `work`; for tests, not exported from the package. */
export function decodeCounted(image: ImageLike, options: DecodeOptions = {}, work?: Work): DecodeResult | undefined {
  const { width, height } = image
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Width and height must be positive integers')
  }
  const stride = options.rowStride ?? width
  if (!Number.isInteger(stride) || stride < width) throw new RangeError('rowStride must be an integer of at least width')
  const channels = channelsFor(image, stride, options.channels)
  const bits = binarise(toLuminance(image.data, width, height, channels, stride))
  const inversion = options.inversion ?? 'both'
  if (inversion !== 'inverted') {
    const found = search(bits, false, work)
    if (found) return found
  }
  if (inversion !== 'normal') return search(invert(bits), true, work)
  return undefined
}

function search(image: BitImage, inverted: boolean, work?: Work): DecodeResult | undefined {
  // A strict pass first; a looser one for blurred or small codes.
  for (const tolerance of [0.5, 0.8]) {
    const triples = finderTriples(image, findFinders(image, tolerance, work)).slice(0, MAX_TRIPLES)
    for (const triple of triples) {
      const first = locate(image, triple, undefined, work)
      if (first.length === 0) continue
      // The size estimate can be a version out; try the neighbours too.
      for (const delta of [0, -4, 4, -8, 8]) {
        for (const location of delta === 0 ? first : locate(image, triple, first[0]!.size + delta, work)) {
          if (work) work.maps++
          const result = read(image, location, inverted)
          if (result) return result
        }
      }
    }
  }
  return undefined
}

function read(image: BitImage, location: Location, inverted: boolean): DecodeResult | undefined {
  const { size, project } = location
  const modules = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = project(x, y)
      const px = Math.floor(p.x)
      const py = Math.floor(p.y)
      if (px >= 0 && py >= 0 && px < image.width && py < image.height) modules[y * size + x] = image.data[py * image.width + px]!
    }
  }
  const where = {
    topLeft: location.topLeft,
    topRight: location.topRight,
    bottomLeft: location.bottomLeft,
    alignment: location.alignment,
  }
  const straight = readSymbol((x, y) => modules[y * size + x] === 1, size)
  if (straight) return { ...straight, mirrored: false, inverted, location: where }
  const mirrored = readSymbol((x, y) => modules[x * size + y] === 1, size)
  if (mirrored) return { ...mirrored, mirrored: true, inverted, location: where }
  return undefined
}

/**
 * Reads a symbol from its module grid, `size` by `size`, row by row, truthy
 * for dark, with no quiet zone. Mirrored grids read too.
 */
export function decodeModules(modules: ArrayLike<number | boolean>, size: number): (Payload & { readonly mirrored: boolean }) | undefined {
  if (modules.length < size * size) throw new RangeError('Fewer modules than size x size')
  const at = (i: number) => Boolean(modules[i])
  const straightRead: ModuleReader = (x, y) => at(y * size + x)
  const straight = readSymbol(straightRead, size)
  if (straight) return { ...straight, mirrored: false }
  const mirrored = readSymbol((x, y) => at(x * size + y), size)
  return mirrored ? { ...mirrored, mirrored: true } : undefined
}
