// The second look (SPEC.md, decoder step 8): when the ordinary search finds
// nothing, a few maps whose format information already agrees are read again
// with their module centres moved onto the edges the picture shows, sampling
// grey rather than black and white.
import { thresholdAt, type Luminance, type Thresholds } from './binarise.js'
import { EC_ORDER, FORMAT_COORDS, formatBits, type ErrorCorrection } from './encode.js'
import type { Location, Point, Work } from './locate.js'
import { readSymbol, readVersion, type ModuleReader, type Payload } from './symbol.js'
import { ALIGNMENT_CENTRES } from './tables.js'

/** Both format copies within this many bits of the same format word. */
const AGREEMENT = 2
/** Maps read again, at most, per decode. */
export const SECOND_LOOKS = 4

const FORMATS: readonly { bits: number; ecc: ErrorCorrection; mask: number }[] = EC_ORDER.flatMap((ecc) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((mask) => ({ bits: formatBits(ecc, mask), ecc, mask })),
)

function popcount(n: number): number {
  let c = 0
  for (; n !== 0; n &= n - 1) c++
  return c
}

/** A map the ordinary read could not use, whose format copies agree. */
export interface Candidate {
  readonly location: Location
  readonly inverted: boolean
  readonly mirrored: boolean
  readonly ecc: ErrorCorrection
  readonly mask: number
  /** The larger of the two copies' distances from the format word. */
  readonly distance: number
}

/**
 * The format word both copies are nearest, read from sampled modules, when
 * both lie within AGREEMENT bits of it; straight before mirrored, and within
 * each the first word in level and mask order.
 */
export function agreement(
  modules: Uint8Array,
  size: number,
): { mirrored: boolean; ecc: ErrorCorrection; mask: number; distance: number } | undefined {
  let best: { mirrored: boolean; ecc: ErrorCorrection; mask: number; distance: number } | undefined
  for (const mirrored of [false, true]) {
    const at = (x: number, y: number) => (mirrored ? modules[x * size + y] : modules[y * size + x]) === 1
    let first = 0
    let second = 0
    for (let i = 14; i >= 0; i--) {
      const [x, y] = FORMAT_COORDS[i]!
      first = (first << 1) | (at(x, y) ? 1 : 0)
      second = (second << 1) | (at(i < 8 ? size - 1 - i : 8, i < 8 ? 8 : size - 7 + (i - 8)) ? 1 : 0)
    }
    for (const f of FORMATS) {
      const distance = Math.max(popcount(f.bits ^ first), popcount(f.bits ^ second))
      if (distance <= AGREEMENT && (best === undefined || distance < best.distance)) {
        best = { mirrored, ecc: f.ecc, mask: f.mask, distance }
      }
    }
  }
  return best
}

/**
 * True when both format copies, read through `read`, lie within AGREEMENT
 * bits of the format word for this level and mask. A read at reduced size
 * counts only then (SPEC.md, decoder step 9).
 */
export function formatAgrees(read: ModuleReader, size: number, ecc: ErrorCorrection, mask: number): boolean {
  const bits = formatBits(ecc, mask)
  let first = 0
  let second = 0
  for (let i = 14; i >= 0; i--) {
    const [x, y] = FORMAT_COORDS[i]!
    first = (first << 1) | (read(x, y) ? 1 : 0)
    second = (second << 1) | (read(i < 8 ? size - 1 - i : 8, i < 8 ? 8 : size - 7 + (i - 8)) ? 1 : 0)
  }
  return popcount(bits ^ first) <= AGREEMENT && popcount(bits ^ second) <= AGREEMENT
}

/**
 * False when a version block, read in the orientation the format copies
 * agreed in, decodes to a version whose size is not the map's: readSymbol
 * rejects such a map, so it is no candidate. A block that does not decode
 * leaves the size to decide, as in readSymbol.
 */
export function sized(modules: Uint8Array, size: number, mirrored: boolean): boolean {
  const version = readVersion(mirrored ? (x, y) => modules[x * size + y] === 1 : (x, y) => modules[y * size + x] === 1, size)
  return version === undefined || 17 + 4 * version === size
}

/** Keeps the best SECOND_LOOKS candidates: least distance first, then the order found. */
export function keep(list: Candidate[], candidate: Candidate): void {
  let i = list.length
  while (i > 0 && list[i - 1]!.distance > candidate.distance) i--
  if (i >= SECOND_LOOKS) return
  list.splice(i, 0, candidate)
  if (list.length > SECOND_LOOKS) list.pop()
}

/** Darkness at a picture point: positive for dark, from the grey against the binariser's threshold. */
type Probe = (x: number, y: number) => number

function probeFor(image: Luminance, t: Thresholds, inverted: boolean): Probe {
  const { data, width, height } = image
  return (x, y) => {
    // Outside the picture counts as light, as in the ordinary read.
    if (!(x >= 0 && y >= 0 && x < width && y < height)) return -1
    // Bilinear grey, with pixel centres at i + 0.5.
    const fx = x - 0.5
    const fy = y - 0.5
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(fx)))
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(fy)))
    const x1 = Math.min(width - 1, x0 + 1)
    const y1 = Math.min(height - 1, y0 + 1)
    const ax = Math.max(0, Math.min(1, fx - x0))
    const ay = Math.max(0, Math.min(1, fy - y0))
    const top = data[y0 * width + x0]! * (1 - ax) + data[y0 * width + x1]! * ax
    const bottom = data[y1 * width + x0]! * (1 - ax) + data[y1 * width + x1]! * ax
    const grey = top * (1 - ay) + bottom * ay
    const d = thresholdAt(t, width, height, Math.floor(x), Math.floor(y)) - grey
    return inverted ? -d : d
  }
}

const STEP = 1 / 16

/**
 * Walks one timing pattern from module 8 to size - 9, finding each module's
 * run of its colour near where the last one was, and returns each module's
 * offset along the line in modules (0 where the finders are). A run under
 * 0.4 or over 1.6 modules is no measurement; gaps are filled from their
 * neighbours after a median of three.
 */
function walk(size: number, along: (k: number) => Point, next: (k: number) => Point, probe: Probe): Float64Array {
  const measured = new Float64Array(size).fill(NaN)
  let prior = 0
  for (let k = 8; k <= size - 9; k++) {
    const p = along(k)
    const q = next(k)
    const ux = q.x - p.x
    const uy = q.y - p.y
    const dark = k % 2 === 0
    const right = (t: number) => {
      const d = probe(p.x + ux * t, p.y + uy * t)
      return dark ? d > 0 : d <= 0
    }
    let seed = NaN
    for (let s = 0; s <= 12 && Number.isNaN(seed); s++) {
      if (s === 0) {
        if (right(prior)) seed = prior
      } else if (right(prior - s * STEP)) seed = prior - s * STEP
      else if (right(prior + s * STEP)) seed = prior + s * STEP
    }
    if (Number.isNaN(seed)) continue
    let a = seed
    let b = seed
    while (a - seed > -1.6 && right(a - STEP)) a -= STEP
    while (b - seed < 1.6 && right(b + STEP)) b += STEP
    const width = b - a + STEP
    if (width < 0.4 || width > 1.6) continue
    measured[k] = (a + b) / 2
    prior = measured[k]!
  }
  const out = new Float64Array(size)
  for (let k = 0; k < size; k++) {
    if (k < 8 || k > size - 9) continue
    // Sorted by insertion, so both ports order equal values alike.
    const near: number[] = []
    for (const v of [measured[k - 1]!, measured[k]!, measured[k + 1]!]) {
      if (Number.isNaN(v)) continue
      let i = near.length
      while (i > 0 && near[i - 1]! > v) i--
      near.splice(i, 0, v)
    }
    out[k] = near.length > 0 ? near[Math.floor(near.length / 2)]! : NaN
  }
  for (let k = 0; k < size; k++) {
    if (!Number.isNaN(out[k]!)) continue
    let l = k - 1
    while (l >= 0 && Number.isNaN(out[l]!)) l--
    let r = k + 1
    while (r < size && Number.isNaN(out[r]!)) r++
    const lv = l >= 0 ? out[l]! : 0
    const rv = r < size ? out[r]! : 0
    out[k] = l < 0 ? rv : r >= size ? lv : lv + ((rv - lv) * (k - l)) / (r - l)
  }
  return out
}

/**
 * Where the colour changes between two module centres, as an offset in
 * modules from the midpoint, searched in sixteenths from the first centre;
 * undefined if the first centre is not the colour expected.
 */
function edge(from: Point, to: Point, darkFrom: boolean, probe: Probe): number | undefined {
  let previous = 0
  for (let s = 0; s <= 16; s++) {
    const t = s / 16
    const d = probe(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
    if (darkFrom ? d > 0 : d <= 0) {
      previous = d
      continue
    }
    if (s === 0) return undefined
    const f = previous === d ? 0.5 : previous / (previous - d)
    return (s - 1) / 16 + Math.max(0, Math.min(1, f)) / 16 - 0.5
  }
  return undefined
}

/** A least-squares line through (index, offset) pairs; zero with fewer than three. */
function line(points: number[]): (t: number) => number {
  const n = points.length / 2
  if (n < 3) return () => 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!
    const y = points[i + 1]!
    sx += x
    sy += y
    sxx += x * x
    sxy += x * y
  }
  const den = n * sxx - sx * sx
  const b = den === 0 ? 0 : (n * sxy - sx * sy) / den
  const a = (sy - b * sx) / n
  return (t) => a + b * t
}

/** Furthest an alignment pattern is looked for from its prediction, in modules either way. */
const REACH = 3
/** Steps of the search, a quarter module. */
const QUARTER = 4
/** Of the 25 modules of an alignment pattern, how many must match for it to count as found. */
const FOUND = 24

/**
 * The map bent onto the alignment patterns the picture shows (decoder step 8,
 * the mesh). Each pattern of the version's lattice is looked for near where
 * its neighbours, already placed, say it is, working outward from the
 * finders; its offset from the map, in modules, is the centre of the offsets
 * where the most of its 25 modules match. A pattern matched by fewer than
 * FOUND modules, or whose best offsets spread or reach the window's edge, is
 * doubtful and takes its neighbours' prediction. Offsets between lattice
 * points are interpolated bilinearly, and held at the outermost row and
 * column beyond them. Undefined below version 7, or when no pattern is found.
 */
function mesh(location: Location, probe: Probe, work?: Work): Location | undefined {
  const { size, project } = location
  const version = (size - 17) / 4
  const c = ALIGNMENT_CENTRES[version - 1]
  if (c === undefined || c.length < 3) return undefined
  const n = c.length
  const ox = new Float64Array(n * n)
  const oy = new Float64Array(n * n)
  // 0 not yet placed; 1 a finder's corner, placed by the map; 2 found; 3 predicted.
  const state = new Uint8Array(n * n)
  state[0] = state[n - 1] = state[(n - 1) * n] = 1
  const order: number[] = []
  for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (state[r * n + q] === 0) order.push(r * n + q)
  // Lattice steps to the nearest finder; row, then column, on a tie.
  const away = (i: number) => {
    const q = i % n
    const r = (i - q) / n
    return Math.min(q + r, n - 1 - q + r, q + n - 1 - r)
  }
  order.sort((a, b) => away(a) - away(b) || a - b)
  const steps = REACH * QUARTER
  let found = 0
  for (const i of order) {
    const q = i % n
    const r = (i - q) / n
    // The prediction: the mean offset of the neighbours already placed.
    let px = 0
    let py = 0
    let k = 0
    for (const [a, b] of [[q - 1, r], [q + 1, r], [q, r - 1], [q, r + 1]] as const) {
      if (a < 0 || b < 0 || a >= n || b >= n || state[b * n + a] === 0) continue
      px += ox[b * n + a]!
      py += oy[b * n + a]!
      k++
    }
    if (k > 0) {
      px /= k
      py /= k
    }
    const cx = c[q]! + px
    const cy = c[r]! + py
    let best = -1
    let sx = 0
    let sy = 0
    let count = 0
    let low = 0
    let high = 0
    let lowY = 0
    let highY = 0
    for (let j = -steps; j <= steps; j++) {
      for (let s = -steps; s <= steps; s++) {
        const u = s / QUARTER
        const v = j / QUARTER
        let score = 0
        for (let b = -2; b <= 2; b++) {
          for (let a = -2; a <= 2; a++) {
            const p = project(cx + u + a, cy + v + b)
            if (probe(p.x, p.y) > 0 === (Math.max(Math.abs(a), Math.abs(b)) !== 1)) score++
          }
        }
        if (score > best) {
          best = score
          sx = sy = count = 0
          low = high = s
          lowY = highY = j
        }
        if (score === best) {
          sx += s
          sy += j
          count++
          low = Math.min(low, s)
          high = Math.max(high, s)
          lowY = Math.min(lowY, j)
          highY = Math.max(highY, j)
        }
      }
    }
    if (work) work.probed += (2 * steps + 1) * (2 * steps + 1) * 25
    // In quarter modules: the best offsets' centre, and how far they spread from it.
    const mx = sx / count
    const my = sy / count
    const spread = Math.max(mx - low, high - mx, my - lowY, highY - my)
    if (best >= FOUND && spread <= 3 && Math.abs(mx) <= steps - 1 && Math.abs(my) <= steps - 1) {
      ox[i] = px + mx / QUARTER
      oy[i] = py + my / QUARTER
      state[i] = 2
      found++
    } else {
      ox[i] = px
      oy[i] = py
      state[i] = 3
    }
  }
  if (found === 0) return undefined
  if (work) work.meshes++
  const cell = (z: number): [number, number] => {
    const t = Math.max(c[0]!, Math.min(c[n - 1]!, z))
    let i = 0
    while (i < n - 2 && t > c[i + 1]!) i++
    return [i, (t - c[i]!) / (c[i + 1]! - c[i]!)]
  }
  const bent = (x: number, y: number): Point => {
    const [i, s] = cell(x)
    const [j, t] = cell(y)
    const o = j * n + i
    const dx = (1 - t) * ((1 - s) * ox[o]! + s * ox[o + 1]!) + t * ((1 - s) * ox[o + n]! + s * ox[o + n + 1]!)
    const dy = (1 - t) * ((1 - s) * oy[o]! + s * oy[o + 1]!) + t * ((1 - s) * oy[o + n]! + s * oy[o + n + 1]!)
    return project(x + dx, y + dy)
  }
  return { ...location, project: bent, matrix: undefined }
}

/**
 * Reads one candidate again; the result must keep the level and mask its
 * format copies agreed on. With `strict`, the format copies of the modules
 * read again must also agree on them, as every read at reduced size must.
 */
export function secondLook(image: Luminance, t: Thresholds, candidate: Candidate, work?: Work, strict = false): Payload | undefined {
  const { inverted, mirrored } = candidate
  const probe = probeFor(image, t, inverted)
  // 0. From version 7, the map bent onto the alignment patterns it can find.
  const location = mesh(candidate.location, probe, work) ?? candidate.location
  const { size, project } = location
  // 1. The timing patterns: shift whole columns and rows by what they show.
  const cols = walk(size, (k) => project(k, 6), (k) => project(k + 1, 6), probe)
  const rows = walk(size, (k) => project(6, k), (k) => project(6, k + 1), probe)
  const centres: Point[] = []
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) centres.push(project(x + cols[x]!, y + rows[y]!))
  const at = (x: number, y: number) => centres[y * size + x]!
  const grid = new Uint8Array(size * size)
  for (let i = 0; i < grid.length; i++) grid[i] = probe(centres[i]!.x, centres[i]!.y) > 0 ? 1 : 0
  // 2. Each boundary between unlike neighbours: where the edge really is, as a line along the boundary.
  const across: ((t: number) => number)[] = []
  const down: ((t: number) => number)[] = []
  for (let i = 0; i < size - 1; i++) {
    const pointsAcross: number[] = []
    const pointsDown: number[] = []
    for (let j = 0; j < size; j++) {
      const a = grid[j * size + i]!
      if (a !== grid[j * size + i + 1]!) {
        const o = edge(at(i, j), at(i + 1, j), a === 1, probe)
        if (o !== undefined) pointsAcross.push(j, o)
      }
      const b = grid[i * size + j]!
      if (b !== grid[(i + 1) * size + j]!) {
        const o = edge(at(j, i), at(j, i + 1), b === 1, probe)
        if (o !== undefined) pointsDown.push(j, o)
      }
    }
    across.push(line(pointsAcross))
    down.push(line(pointsDown))
  }
  // 3. Each module centre moves by the mean of its two boundaries' offsets; sample grey there.
  const modules = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x === 0 ? across[0]!(y) : x === size - 1 ? across[size - 2]!(y) : (across[x - 1]!(y) + across[x]!(y)) / 2
      const dy = y === 0 ? down[0]!(x) : y === size - 1 ? down[size - 2]!(x) : (down[y - 1]!(x) + down[y]!(x)) / 2
      const p = project(x + cols[x]! + dx, y + rows[y]! + dy)
      modules[y * size + x] = probe(p.x, p.y) > 0 ? 1 : 0
    }
  }
  const read: ModuleReader = mirrored ? (x, y) => modules[x * size + y] === 1 : (x, y) => modules[y * size + x] === 1
  const result = readSymbol(read, size)
  if (result === undefined || result.ecc !== candidate.ecc || result.mask !== candidate.mask) return undefined
  if (strict && !formatAgrees(read, size, result.ecc, result.mask)) return undefined
  return result
}
