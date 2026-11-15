import { binarise, invert, shrink, thresholds, toLuminance, type BitImage, type Luminance } from './binarise.js'
import { estimateSize, finderTriples, findFinders, locate, type Finder, type Location, type Point, type Work } from './locate.js'
import { agreement, formatAgrees, keep, SECOND_LOOKS, secondLook, sized, type Candidate } from './refine.js'
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
  // Three bytes a pixel would otherwise be read as greyscale and find nothing.
  if (given === undefined && data.length >= last * 3 && data.length < last * 4) {
    throw new RangeError('The data looks like three bytes a pixel: pass RGBA or greyscale, or name channels')
  }
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
  if (image === null || typeof image !== 'object') throw new TypeError('decode needs { data, width, height }')
  const kind = Object.prototype.toString.call(image.data).slice(8, -1)
  if (kind !== 'Uint8Array' && kind !== 'Uint8ClampedArray') {
    throw new TypeError(`data must be a Uint8Array or Uint8ClampedArray, not ${kind}`)
  }
  options ??= {}
  const inversion = options.inversion ?? 'both'
  if (inversion !== 'both' && inversion !== 'normal' && inversion !== 'inverted') {
    throw new RangeError("inversion must be 'normal', 'inverted' or 'both'")
  }
  const { width, height } = image
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Width and height must be positive integers')
  }
  const stride = options.rowStride ?? width
  if (!Number.isInteger(stride) || stride < width) throw new RangeError('rowStride must be an integer of at least width')
  const channels = channelsFor(image, stride, options.channels)
  const luminance = toLuminance(image.data, width, height, channels, stride)
  const budget: Budget = { maps: MAX_MAPS, second: SECOND_LOOKS, here: MAX_MAPS }
  const found = look(luminance, inversion, 1, budget, work)
  if (found) return found
  // Nothing read at full size: the picture shrunk, coarse to fine, for codes
  // whose modules are large or carry texture or scan lines (decoder step 9).
  for (const f of REDUCTIONS) {
    if (Math.floor(width / f) < MIN_REDUCED || Math.floor(height / f) < MIN_REDUCED) continue
    // With no maps left no size can read, nor keep a candidate for a second look.
    if (budget.maps === 0) break
    budget.here = REDUCED_MAPS
    const reduced = look(shrink(luminance, f), inversion, f, budget, work)
    if (reduced) return reduced
  }
  return undefined
}

/** Maps sampled a frame, at most, at every size together: four passes, six triples, five sizes, six maps a size. */
const MAX_MAPS = 4 * MAX_TRIPLES * 5 * 6
/** The reduced-size pass's factors, coarse to fine. */
const REDUCTIONS = [8, 4, 2] as const
/** A reduced picture narrower or shorter than this cannot hold a version 1 symbol at a pixel a module. */
const MIN_REDUCED = 21
/** Maps each reduced size may take, out of what the frame has left. */
const REDUCED_MAPS = 30

/** What is left of a frame's maps and second looks, shared by every size, and of the maps this size may take. */
interface Budget {
  maps: number
  second: number
  here: number
}

/**
 * The ordinary search in each polarity, then the second look, on a picture
 * shrunk by `f` (1 for the picture itself). At reduced size a read counts
 * only if its format copies agree on its level and mask, and locations are
 * given in full-picture coordinates.
 */
function look(luminance: Luminance, inversion: 'both' | 'normal' | 'inverted', f: number, budget: Budget, work?: Work): DecodeResult | undefined {
  const bits = binarise(luminance)
  const strict = f > 1
  const candidates: Candidate[] = []
  if (inversion !== 'inverted') {
    const found = search(bits, false, candidates, budget, strict, f, work)
    if (found) return found
  }
  if (inversion !== 'normal') {
    const found = search(invert(bits), true, candidates, budget, strict, f, work)
    if (found) return found
  }
  // Nothing read: look again at the few maps whose format copies agreed.
  if (candidates.length === 0 || budget.second === 0) return undefined
  const levels = thresholds(luminance)
  for (const candidate of candidates) {
    if (budget.second === 0) break
    budget.second--
    if (work) work.second++
    const result = secondLook(luminance, levels, candidate, work, strict)
    if (result) return { ...result, mirrored: candidate.mirrored, inverted: candidate.inverted, location: where(candidate.location, f) }
  }
  return undefined
}

/**
 * A location in full-picture coordinates. Picture coordinates are continuous,
 * pixel i covering [i, i + 1), so a point x in a picture shrunk by f lies at x * f.
 */
function where(location: Location, f: number): DecodeResult['location'] {
  if (f === 1) {
    return {
      topLeft: location.topLeft,
      topRight: location.topRight,
      bottomLeft: location.bottomLeft,
      alignment: location.alignment,
    }
  }
  const up = (p: Point): Point => ({ x: p.x * f, y: p.y * f })
  return {
    topLeft: up(location.topLeft),
    topRight: up(location.topRight),
    bottomLeft: up(location.bottomLeft),
    alignment: location.alignment === undefined ? undefined : up(location.alignment),
  }
}

function search(
  image: BitImage,
  inverted: boolean,
  candidates: Candidate[],
  budget: Budget,
  strict: boolean,
  f: number,
  work?: Work,
): DecodeResult | undefined {
  // A strict pass first; a looser one for blurred or small codes.
  for (const tolerance of [0.5, 0.8]) {
    const triples = finderTriples(image, findFinders(image, tolerance, work)).slice(0, MAX_TRIPLES)
    for (const triple of triples) {
      const first = locate(image, triple, undefined, work)
      // An estimate past version 40 by no more than the retries reach still
      // tries the sizes of 177 or less among them.
      const size = first.length > 0 ? first[0]!.size : over(image, triple)
      if (size === undefined) continue
      // The size estimate can be a version out; try the neighbours too.
      for (const delta of [0, -4, 4, -8, 8]) {
        for (const location of delta === 0 ? first : locate(image, triple, size + delta, work)) {
          if (budget.maps === 0 || budget.here === 0) return undefined
          budget.maps--
          budget.here--
          if (work) {
            work.maps++
            if (f > 1) work.reduced = (work.reduced ?? 0) + 1
          }
          const result = read(image, location, inverted, candidates, strict, f)
          if (result) return result
        }
      }
    }
  }
  return undefined
}

/** The size estimate when it is past 177 by at most the retries' 8; otherwise undefined. */
function over(image: BitImage, triple: readonly [Finder, Finder, Finder]): number | undefined {
  const size = estimateSize(image, triple)
  return size !== undefined && size > 177 && size <= 177 + 8 ? size : undefined
}

function read(
  image: BitImage,
  location: Location,
  inverted: boolean,
  candidates: Candidate[],
  strict: boolean,
  f: number,
): DecodeResult | undefined {
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
  const straightRead: ModuleReader = (x, y) => modules[y * size + x] === 1
  const straight = readSymbol(straightRead, size)
  if (straight) {
    // At reduced size, a read whose format copies do not agree on its level and mask is no read.
    if (strict && !formatAgrees(straightRead, size, straight.ecc, straight.mask)) return undefined
    return { ...straight, mirrored: false, inverted, location: where(location, f) }
  }
  const mirroredRead: ModuleReader = (x, y) => modules[x * size + y] === 1
  const mirrored = readSymbol(mirroredRead, size)
  if (mirrored) {
    if (strict && !formatAgrees(mirroredRead, size, mirrored.ecc, mirrored.mask)) return undefined
    return { ...mirrored, mirrored: true, inverted, location: where(location, f) }
  }
  const agreed = agreement(modules, size)
  if (agreed && sized(modules, size, agreed.mirrored)) keep(candidates, { location, inverted, ...agreed })
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
