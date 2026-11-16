import { imageLayout, type ImageLike, type DecodeOptions } from './image.js'
export type { ImageLike, DecodeOptions } from './image.js'
import { binarise, invert, reductions, thresholds, toLuminance, type BitImage, type Luminance } from './binarise.js'
import { edgesOf, estimateSize, finderTriples, findFinders, locate, type Edges, type Finder, type Location, type Point, type Work } from './locate.js'
import { agreement, formatAgrees, keep, SECOND_LOOKS, secondLook, sized, type Candidate } from './refine.js'
import { readSymbol, type ModuleReader, type Payload } from './symbol.js'

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

/**
 * Finds and reads one QR code in a picture. Returns undefined when no
 * readable code is found.
 */
export function decode(image: ImageLike, options: DecodeOptions = {}): DecodeResult | undefined {
  return decodeCounted(image, options)
}

/** Working storage owned by one decoder session, never the caller's data. */
export interface DecodeWorkspace {
  luminance?: Uint8Array | undefined
}

/** Counts search work for tests; optional internal storage leaves ordinary decode() stateless. */
export function decodeCounted(image: ImageLike, options: DecodeOptions = {}, work?: Work, workspace?: DecodeWorkspace): DecodeResult | undefined {
  const { width, height, stride, channels, inversion } = imageLayout(image, options)
  let storage: Uint8Array | undefined
  if (workspace) {
    if (!workspace.luminance || workspace.luminance.length < width * height) workspace.luminance = new Uint8Array(width * height)
    storage = workspace.luminance.subarray(0, width * height)
  }
  const luminance = toLuminance(image.data, width, height, channels, stride, storage)
  const budget: Budget = { maps: MAX_MAPS, second: SECOND_LOOKS, here: MAX_MAPS }
  const found = look(luminance, inversion, 1, budget, work)
  if (found) return found
  // Nothing read at full size: the picture shrunk, coarse to fine, for codes
  // whose modules are large or carry texture or scan lines (decoder step 9).
  const shrunk = reductions(luminance)
  for (const f of REDUCTIONS) {
    if (Math.floor(width / f) < MIN_REDUCED || Math.floor(height / f) < MIN_REDUCED) continue
    // With no maps left no size can read, nor keep a candidate for a second look.
    if (budget.maps === 0) break
    budget.here = REDUCED_MAPS
    const reduced = look(shrunk(f), inversion, f, budget, work)
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
  const levels = thresholds(luminance)
  const bits = binarise(luminance, levels)
  const strict = f > 1
  const candidates: Candidate[] = []
  // The inverse changes colour where the picture does, so one set of edges serves both.
  const edges = edgesOf(bits)
  if (inversion !== 'inverted') {
    const found = search(bits, edges, false, candidates, budget, strict, f, work)
    if (found) return found
  }
  if (inversion !== 'normal') {
    const found = search(invert(bits), edges, true, candidates, budget, strict, f, work)
    if (found) return found
  }
  // Nothing read: look again at the few maps whose format copies agreed.
  if (candidates.length === 0 || budget.second === 0) return undefined
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
  edges: Edges,
  inverted: boolean,
  candidates: Candidate[],
  budget: Budget,
  strict: boolean,
  f: number,
  work?: Work,
): DecodeResult | undefined {
  // A strict pass first; a looser one for blurred or small codes.
  for (const tolerance of [0.5, 0.8]) {
    const triples = finderTriples(image, findFinders(image, tolerance, work, edges)).slice(0, MAX_TRIPLES)
    for (const triple of triples) {
      const first = locate(image, triple, undefined, work, edges)
      // An estimate past version 40 by no more than the retries reach still
      // tries the sizes of 177 or less among them.
      const size = first.length > 0 ? first[0]!.size : over(image, triple)
      if (size === undefined) continue
      // The size estimate can be a version out; try the neighbours too.
      for (const delta of [0, -4, 4, -8, 8]) {
        for (const location of delta === 0 ? first : locate(image, triple, size + delta, work, edges)) {
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
  const { size, project, matrix } = location
  const modules = new Uint8Array(size * size)
  if (matrix) {
    // project(x, y), written out so that no point is made for each module.
    const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix as [number, number, number, number, number, number, number, number, number]
    const { data, width, height } = image
    for (let y = 0; y < size; y++) {
      const v = y + 0.5
      for (let x = 0; x < size; x++) {
        const u = x + 0.5
        const w = m6 * u + m7 * v + m8
        const px = Math.floor((m0 * u + m1 * v + m2) / w)
        const py = Math.floor((m3 * u + m4 * v + m5) / w)
        if (px >= 0 && py >= 0 && px < width && py < height) modules[y * size + x] = data[py * width + px]!
      }
    }
  } else {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = project(x, y)
        const px = Math.floor(p.x)
        const py = Math.floor(p.y)
        if (px >= 0 && py >= 0 && px < image.width && py < image.height) modules[y * size + x] = image.data[py * image.width + px]!
      }
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
