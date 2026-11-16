import { imageLayout, type ImageLike, type DecodeOptions } from './image.js'
export type { ImageLike, DecodeOptions } from './image.js'
import { binarise, invert, invertLuminance, reductions, thresholds, toLuminance, type BitImage, type Luminance } from './binarise.js'
import { edgesOf, estimateSize, finderTriples, findFinders, locate, type Edges, type Finder, type Location, type Point, type Work } from './locate.js'
import { agreement, agreementRead, formatAgrees, keep, SECOND_LOOKS, secondLook, sized, type Candidate } from './refine.js'
import { agreedVersion, readSymbol, type ModuleReader, type Payload } from './symbol.js'
import { FORMAT_COORDS } from './encode.js'

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
  const budget: Budget = { maps: MAX_MAPS, second: SECOND_LOOKS, here: MAX_MAPS, invertedFallback: false, uniform: false, hints: [] }
  const found = look(luminance, inversion, 1, budget, work)
  if (found) return found
  if (budget.uniform) return undefined
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
  if (inversion !== 'normal' && budget.maps > 0 && budget.invertedFallback) {
    budget.here = REDUCED_MAPS
    const inverse = invertLuminance(luminance)
    const fallback = look(inverse, 'normal', 1, budget, work, true)
    if (fallback) return { ...fallback, inverted: true }
    const inverseShrunk = reductions(inverse)
    for (const f of REDUCTIONS) {
      if (budget.maps === 0 || budget.here === 0) break
      if (Math.floor(width / f) < MIN_REDUCED || Math.floor(height / f) < MIN_REDUCED) continue
      const reduced = look(inverseShrunk(f), 'normal', f, budget, work, true)
      if (reduced) return { ...reduced, inverted: true }
    }
  }
  return recoverVersion(luminance, budget, work)
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
  invertedFallback: boolean
  uniform: boolean
  hints: VersionHint[]
}

interface VersionHint {
  readonly triple: readonly [Finder, Finder, Finder]
  readonly size: number
  readonly inverted: boolean
}

/**
 * The ordinary search in each polarity, then the second look, on a picture
 * shrunk by `f` (1 for the picture itself). At reduced size a read counts
 * only if its format copies agree on its level and mask, and locations are
 * given in full-picture coordinates.
 */
function look(luminance: Luminance, inversion: 'both' | 'normal' | 'inverted', f: number, budget: Budget, work?: Work, strictOverride = false): DecodeResult | undefined {
  const levels = thresholds(luminance)
  if (f === 1 && !strictOverride) {
    budget.invertedFallback = levels.invertedFallback
    budget.uniform = levels.uniform
  }
  if (levels.uniform) return undefined
  const bits = binarise(luminance, levels)
  const strict = f > 1 || strictOverride
  const candidates: Candidate[] = []
  // The inverse changes colour where the picture does, so one set of edges serves both.
  const edges = edgesOf(bits)
  if (inversion !== 'inverted') {
    const found = search(bits, edges, false, candidates, budget, strict, f, work, f === 1 && !strictOverride)
    if (found) return found
  }
  if (inversion !== 'normal') {
    const found = search(invert(bits), edges, true, candidates, budget, strict, f, work, f === 1 && !strictOverride)
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
  collectHints = false,
): DecodeResult | undefined {
  if (budget.maps === 0 || budget.here === 0) return undefined
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
          const result = read(image, location, inverted, candidates, strict, f, collectHints ? budget.hints : undefined, triple)
          if (result) return result
          if (budget.maps === 0 || budget.here === 0) return undefined
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
  hints?: VersionHint[],
  triple?: readonly [Finder, Finder, Finder],
): DecodeResult | undefined {
  const { size, project, matrix } = location
  const modules = new Uint8Array(size * size)
  modules.fill(2) // Unsampled; projected light and dark modules are 0 and 1.
  let sample: ModuleReader
  if (matrix) {
    // project(x, y), written out so that no point is made for each module.
    const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = matrix as [number, number, number, number, number, number, number, number, number]
    const { data, width, height } = image
    sample = (x, y) => {
      const index = y * size + x
      if (modules[index] !== 2) return modules[index] === 1
      const v = y + 0.5
      const u = x + 0.5
      const w = m6 * u + m7 * v + m8
      const px = Math.floor((m0 * u + m1 * v + m2) / w)
      const py = Math.floor((m3 * u + m4 * v + m5) / w)
      const value = px >= 0 && py >= 0 && px < width && py < height ? data[py * width + px]! : 0
      modules[index] = value
      return value === 1
    }
  } else {
    sample = (x, y) => {
      const index = y * size + x
      if (modules[index] !== 2) return modules[index] === 1
      const p = project(x, y)
      const px = Math.floor(p.x)
      const py = Math.floor(p.y)
      const value = px >= 0 && py >= 0 && px < image.width && py < image.height ? image.data[py * image.width + px]! : 0
      modules[index] = value
      return value === 1
    }
  }
  if (strict && !agreementRead(sample, size)) return undefined
  const straightRead = sample
  const straight = readSymbol(straightRead, size)
  if (straight) {
    // At reduced size, a read whose format copies do not agree on its level and mask is no read.
    if (strict && !formatAgrees(straightRead, size, straight.ecc, straight.mask)) return undefined
    return { ...straight, mirrored: false, inverted, location: where(location, f) }
  }
  const mirroredRead: ModuleReader = (x, y) => sample(y, x)
  const mirrored = readSymbol(mirroredRead, size)
  if (mirrored) {
    if (strict && !formatAgrees(mirroredRead, size, mirrored.ecc, mirrored.mask)) return undefined
    return { ...mirrored, mirrored: true, inverted, location: where(location, f) }
  }
  // A version mismatch can stop either symbol read before its format is read.
  // Populate both orientations before checking the candidate for a second look.
  for (let i = 0; i < 15; i++) {
    const [x, y] = FORMAT_COORDS[i]!
    sample(x, y); sample(y, x)
    const sx = i < 8 ? size - 1 - i : 8
    const sy = i < 8 ? 8 : size - 7 + (i - 8)
    sample(sx, sy); sample(sy, sx)
  }
  const agreed = agreement(modules, size)
  if (agreed && sized(modules, size, agreed.mirrored)) keep(candidates, { location, inverted, ...agreed })
  if (agreed && hints && triple && hints.length < SECOND_LOOKS) {
    const version = agreedVersion(agreed.mirrored ? mirroredRead : straightRead, size)
    if (version !== undefined && 17 + 4 * version !== size) {
      const target = 17 + 4 * version
      const duplicate = hints.some(h => h.size === target && h.inverted === inverted &&
        h.triple.every((p, i) => p.x === triple[i]!.x && p.y === triple[i]!.y))
      if (!duplicate) hints.push({ triple, size: target, inverted })
    }
  }
  return undefined
}

/** Evidence-directed retries run only after every existing search and second look has failed. */
function recoverVersion(luminance: Luminance, budget: Budget, work?: Work): DecodeResult | undefined {
  if (budget.hints.length === 0 || budget.maps === 0) return undefined
  const levels = thresholds(luminance)
  const bits = binarise(luminance, levels)
  const edges = edgesOf(bits)
  let inverse: BitImage | undefined
  const candidates: Candidate[] = []
  let remaining = REDUCED_MAPS
  for (const hint of budget.hints) {
    if (budget.maps === 0 || remaining === 0) break
    const image = hint.inverted ? (inverse ??= invert(bits)) : bits
    for (const location of locate(image, hint.triple, hint.size, work, edges)) {
      if (budget.maps === 0 || remaining === 0) break
      budget.maps--
      remaining--
      if (work) work.maps++
      const result = read(image, location, hint.inverted, candidates, true, 1)
      if (result) return result
    }
  }
  // A queued map can still recover after the ordinary map allowance runs out.
  for (const candidate of candidates) {
    if (budget.second === 0) break
    budget.second--
    if (work) work.second++
    const result = secondLook(luminance, levels, candidate, work, true)
    if (result) return { ...result, mirrored: candidate.mirrored, inverted: candidate.inverted, location: where(candidate.location, 1) }
  }
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
