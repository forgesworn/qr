import { type BitImage } from './binarise.js'

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Finder extends Point {
  readonly moduleSize: number
  readonly count: number
}

/** Where a symbol sits in the picture, and how to sample it. */
export interface Location {
  readonly topLeft: Point
  readonly topRight: Point
  readonly bottomLeft: Point
  readonly alignment: Point | undefined
  readonly size: number
  /** Picture coordinates of the centre of module (x, y). */
  readonly project: (x: number, y: number) => Point
}

/**
 * Work the search does, counted for tests that bound it: pixels stepped in
 * cross-checks, stored candidates compared while merging, pixels in the
 * windows searched for alignment patterns, maps sampled, maps read again
 * by the second look, those of them read through a mesh, and the points the
 * mesh probed looking for alignment patterns.
 */
export interface Work {
  steps: number
  compared: number
  scanned: number
  maps: number
  second: number
  meshes: number
  probed: number
}

const NONE: readonly number[] = []

const dark = (image: BitImage, x: number, y: number): boolean => image.data[y * image.width + x] === 1

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Runs in 1:1:3:1:1 proportion, each within half a module (the centre within 1.5). */
function finderRatio(counts: readonly number[], tolerance = 0.5): boolean {
  const c0 = counts[0]!
  const c1 = counts[1]!
  const c2 = counts[2]!
  const c3 = counts[3]!
  const c4 = counts[4]!
  if (c0 === 0 || c1 === 0 || c2 === 0 || c3 === 0 || c4 === 0) return false
  const total = c0 + c1 + c2 + c3 + c4
  if (total < 7) return false
  const module = total / 7
  const slack = module * tolerance
  return (
    Math.abs(module - c0) < slack &&
    Math.abs(module - c1) < slack &&
    Math.abs(3 * module - c2) < 3 * slack &&
    Math.abs(module - c3) < slack &&
    Math.abs(module - c4) < slack
  )
}

const centreFromEnd = (counts: readonly number[], end: number): number =>
  end - counts[4]! - counts[3]! - counts[2]! / 2

/**
 * Counts the five runs through (x, y) along direction (dx, dy), starting in
 * the dark centre, and returns the centre along that line, or NaN.
 */
function crossCheck(
  image: BitImage,
  x: number,
  y: number,
  dx: number,
  dy: number,
  maxCount: number,
  originalTotal: number,
  tolerance = 0.5,
  work?: Work,
): number {
  const counts = [0, 0, 0, 0, 0]
  try {
    return runs(image, x, y, dx, dy, maxCount, originalTotal, tolerance, counts)
  } finally {
    if (work) work.steps += counts[0]! + counts[1]! + counts[2]! + counts[3]! + counts[4]!
  }
}

function runs(
  image: BitImage,
  x: number,
  y: number,
  dx: number,
  dy: number,
  maxCount: number,
  originalTotal: number,
  tolerance: number,
  counts: number[],
): number {
  const { width, height } = image
  const inside = (px: number, py: number) => px >= 0 && py >= 0 && px < width && py < height
  // A centre run past these lengths could not pass the checks below, so
  // stopping there loses nothing and keeps a long dark stripe from costing its
  // length. Back along the row or down the column, the total would be more
  // than twice the row's. On the diagonal, whose four outer runs stop at
  // maxCount, a centre in proportion is under 29 times maxCount (at the
  // loosest tolerance, 1.05).
  const longest = dx && dy ? 32 * (maxCount + 1) : 2 * originalTotal
  let px = x
  let py = y
  while (inside(px, py) && dark(image, px, py)) {
    if (++counts[2]! > longest) return NaN
    px -= dx
    py -= dy
  }
  while (inside(px, py) && !dark(image, px, py) && counts[1]! <= maxCount) {
    counts[1]!++
    px -= dx
    py -= dy
  }
  if (!inside(px, py) || counts[1]! > maxCount) return NaN
  while (inside(px, py) && dark(image, px, py) && counts[0]! <= maxCount) {
    counts[0]!++
    px -= dx
    py -= dy
  }
  if (counts[0]! > maxCount) return NaN
  px = x + dx
  py = y + dy
  while (inside(px, py) && dark(image, px, py)) {
    if (++counts[2]! > longest) return NaN
    px += dx
    py += dy
  }
  while (inside(px, py) && !dark(image, px, py) && counts[3]! < maxCount) {
    counts[3]!++
    px += dx
    py += dy
  }
  if (!inside(px, py) || counts[3]! >= maxCount) return NaN
  while (inside(px, py) && dark(image, px, py) && counts[4]! < maxCount) {
    counts[4]!++
    px += dx
    py += dy
  }
  if (counts[4]! >= maxCount) return NaN
  const total = counts.reduce((a, b) => a + b, 0)
  // A diagonal crosses the pattern at a longer stretch, so only straight lines
  // compare totals. Back along the row the stretch must match; down the column,
  // perspective can make the pattern up to twice as tall as wide, or half.
  if (dx && !dy && 5 * Math.abs(total - originalTotal) >= 2 * originalTotal) return NaN
  if (dy && !dx && (total >= 2 * originalTotal || 2 * total <= originalTotal)) return NaN
  if (!finderRatio(counts, tolerance)) return NaN
  // Position along the line, measured in steps from the start point.
  const end = dx !== 0 ? px - x : py - y
  return centreFromEnd(counts, end * (dx + dy > 0 ? 1 : -1))
}

/**
 * Finds finder pattern candidates, most often confirmed first. `tolerance`
 * is how far a run may stray from its share, in modules; a blurred light
 * ring needs more than the default half module.
 */
export function findFinders(image: BitImage, tolerance = 0.5, work?: Work): Finder[] {
  const { width, height } = image
  const found: { x: number; y: number; moduleSize: number; count: number }[] = []
  // Candidates filed by 16-pixel cell, so merging compares only nearby ones
  // and a picture full of finder-like patterns costs in proportion to its size.
  const CELL = 16
  const columns = Math.floor(width / CELL) + 1
  const across = (x: number) => Math.min(columns - 1, Math.floor(Math.max(0, x) / CELL))
  const down = (y: number) => Math.floor(Math.max(0, y) / CELL)
  const cells = new Map<number, number[]>()
  const file = (i: number) => {
    const key = down(found[i]!.y) * columns + across(found[i]!.x)
    const cell = cells.get(key)
    if (cell) cell.push(i)
    else cells.set(key, [i])
    return key
  }
  const consider = (counts: readonly number[], y: number, end: number) => {
    const total = counts.reduce((a, b) => a + b, 0)
    let cx = centreFromEnd(counts, end)
    const maxCount = counts[2]!
    const dy = crossCheck(image, Math.floor(cx), y, 0, 1, maxCount, total, tolerance, work)
    if (Number.isNaN(dy)) return false
    const cy = y + dy
    const dx = crossCheck(image, Math.floor(cx), Math.floor(cy), 1, 0, maxCount, total, tolerance, work)
    if (Number.isNaN(dx)) return false
    cx = Math.floor(cx) + dx
    const diagonal = crossCheck(image, Math.floor(cx), Math.floor(cy), 1, 1, maxCount * 2, total, tolerance + 0.25, work)
    if (Number.isNaN(diagonal)) return false
    const moduleSize = total / 7
    // The earliest stored candidate within a module, of a like module size, takes this sighting.
    let match = -1
    for (let r = down(cy - moduleSize); r <= down(cy + moduleSize); r++) {
      for (let c = across(cx - moduleSize); c <= across(cx + moduleSize); c++) {
        for (const i of cells.get(r * columns + c) ?? NONE) {
          if (work) work.compared++
          const f = found[i]!
          if (
            (match < 0 || i < match) &&
            Math.abs(cy - f.y) <= moduleSize &&
            Math.abs(cx - f.x) <= moduleSize &&
            (Math.abs(moduleSize - f.moduleSize) <= 1 || Math.abs(moduleSize - f.moduleSize) <= f.moduleSize * 0.25)
          ) match = i
        }
      }
    }
    if (match >= 0) {
      const f = found[match]!
      const before = down(f.y) * columns + across(f.x)
      const n = f.count + 1
      f.x = (f.x * f.count + cx) / n
      f.y = (f.y * f.count + cy) / n
      f.moduleSize = (f.moduleSize * f.count + moduleSize) / n
      f.count = n
      if (down(f.y) * columns + across(f.x) !== before) {
        const cell = cells.get(before)!
        cell.splice(cell.indexOf(match), 1)
        file(match)
      }
      return true
    }
    found.push({ x: cx, y: cy, moduleSize, count: 1 })
    file(found.length - 1)
    return true
  }

  const data = image.data
  const skip = Math.max(1, Math.min(3, Math.floor(height / 200)))
  for (let y = skip - 1; y < height; y += skip) {
    const counts = [0, 0, 0, 0, 0]
    let state = 0
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (data[row + x] === 1) {
        if (state & 1) state++
        counts[state]!++
      } else if (state & 1) {
        counts[state]!++
      } else if (state === 4) {
        if (finderRatio(counts, tolerance) && consider(counts, y, x)) {
          counts.fill(0)
          state = 0
        } else {
          counts[0] = counts[2]!
          counts[1] = counts[3]!
          counts[2] = counts[4]!
          counts[3] = 1
          counts[4] = 0
          state = 3
        }
      } else {
        state++
        counts[state]!++
      }
    }
    if (state === 4 && finderRatio(counts, tolerance)) consider(counts, y, width)
  }
  return found.sort((a, b) => b.count - a.count)
}

/**
 * Every plausible top-left, top-right, bottom-left triple, best first. The
 * two sides meeting at the top-left should be the same number of modules
 * long, counted along each side, and meet near a right angle. Perspective
 * shrinks modules towards the far edge, so lengths in pixels can differ
 * widely; lengths in modules do not.
 */
export function finderTriples(image: BitImage, finders: readonly Finder[]): [Finder, Finder, Finder][] {
  const pool = finders.slice(0, 12)
  const legs = new Map<number, number>()
  const modulesBetween = (i: number, j: number): number => {
    const key = Math.min(i, j) * 12 + Math.max(i, j)
    let n = legs.get(key)
    if (n === undefined) {
      n = distance(pool[i]!, pool[j]!) / runModuleSize(image, pool[i]!, pool[j]!)
      legs.set(key, n)
    }
    return n
  }
  const triples: { score: number; triple: [Finder, Finder, Finder] }[] = []
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const a = pool[i]!
        const b = pool[j]!
        const c = pool[k]!
        const sizes = [a.moduleSize, b.moduleSize, c.moduleSize]
        if (Math.max(...sizes) > 3 * Math.min(...sizes)) continue
        const ab = distance(a, b)
        const bc = distance(b, c)
        const ca = distance(c, a)
        // The corner opposite the longest side is the top-left.
        let [t, m, n] = [k, i, j]
        if (bc >= ab && bc >= ca) [t, m, n] = [i, j, k]
        else if (ca >= ab) [t, m, n] = [j, k, i]
        const one = modulesBetween(t, m)
        const other = modulesBetween(t, n)
        // The nearest finders in any symbol are 14 modules apart.
        if (!(Math.min(one, other) >= 10)) continue
        const topLeft = pool[t]!
        let p = pool[m]!
        let q = pool[n]!
        const ux = p.x - topLeft.x
        const uy = p.y - topLeft.y
        const vx = q.x - topLeft.x
        const vy = q.y - topLeft.y
        const cos = Math.abs(ux * vx + uy * vy) / Math.hypot(ux, uy) / Math.hypot(vx, vy)
        const mismatch = Math.abs(one - other) / Math.max(one, other)
        if (cos > 0.5 || mismatch > 0.25) continue
        // In picture coordinates (y down) top-right x bottom-left is positive.
        if (ux * vy - uy * vx < 0) [p, q] = [q, p]
        triples.push({ score: cos + mismatch - 0.01 * Math.min(a.count + b.count + c.count, 15), triple: [topLeft, p, q] })
      }
    }
  }
  return triples.sort((x, y) => x.score - y.score).map((t) => t.triple)
}

/** Module size along a line from one finder centre to another, by its black-white-black runs. */
function runModuleSize(image: BitImage, from: Point, to: Point): number {
  const one = blackWhiteBlack(image, from, to)
  const other = blackWhiteBlack(image, to, from)
  if (Number.isNaN(one)) return other / 7
  if (Number.isNaN(other)) return one / 7
  return (one + other) / 14
}

/** Length of the dark-light-dark run from a finder centre outwards, through and beyond the finder edge. */
function blackWhiteBlack(image: BitImage, from: Point, to: Point): number {
  const run = (sx: number, sy: number, tx: number, ty: number): number => {
    const steep = Math.abs(ty - sy) > Math.abs(tx - sx)
    if (steep) [sx, sy, tx, ty] = [sy, sx, ty, tx]
    const dx = Math.abs(tx - sx)
    const dy = Math.abs(ty - sy)
    let error = -dx / 2
    const xstep = sx < tx ? 1 : -1
    const ystep = sy < ty ? 1 : -1
    let state = 0
    let y = sy
    for (let x = sx; x !== tx + xstep; x += xstep) {
      const rx = steep ? y : x
      const ry = steep ? x : y
      if (rx < 0 || ry < 0 || rx >= image.width || ry >= image.height) break
      if ((state === 1) === dark(image, rx, ry)) {
        if (state === 2) return Math.hypot(x - sx, y - sy)
        state++
      }
      error += dy
      if (error > 0) {
        if (y === ty) break
        y += ystep
        error -= dx
      }
    }
    return state === 2 ? Math.hypot(tx + xstep - sx, ty - sy) : NaN
  }
  const sx = Math.floor(from.x)
  const sy = Math.floor(from.y)
  const forward = run(sx, sy, Math.floor(to.x), Math.floor(to.y))
  // The same distance the other way, clipped to the picture.
  let ox = sx - (Math.floor(to.x) - sx)
  let oy = sy - (Math.floor(to.y) - sy)
  let scale = 1
  if (ox < 0) scale = Math.min(scale, sx / (sx - ox))
  else if (ox >= image.width) scale = Math.min(scale, (image.width - 1 - sx) / (ox - sx))
  if (oy < 0) scale = Math.min(scale, sy / (sy - oy))
  else if (oy >= image.height) scale = Math.min(scale, (image.height - 1 - sy) / (oy - sy))
  ox = Math.floor(sx + (ox - sx) * scale)
  oy = Math.floor(sy + (oy - sy) * scale)
  const backward = run(sx, sy, ox, oy)
  if (Number.isNaN(forward) || Number.isNaN(backward)) return NaN
  return forward + backward - 1
}

/**
 * Searches near `estimate` for alignment pattern centres, whose modules span
 * `wide` pixels along a row and `tall` down a column. Candidates seen on two
 * or more rows come first, then nearest the estimate.
 */
function findAlignments(image: BitImage, estimate: Point, wide: number, tall: number, reach: number, work?: Work): Point[] {
  const moduleSize = Math.max(wide, tall)
  const radius = Math.ceil(reach * moduleSize)
  const left = Math.max(0, Math.floor(estimate.x - radius))
  const right = Math.min(image.width - 1, Math.ceil(estimate.x + radius))
  const top = Math.max(0, Math.floor(estimate.y - radius))
  const bottom = Math.min(image.height - 1, Math.ceil(estimate.y + radius))
  if (right - left < moduleSize * 3 || bottom - top < moduleSize * 3) return []
  if (work) work.scanned += (right - left + 1) * (bottom - top + 1)
  const fits = (n: number) => Math.abs(n - wide) < wide * 0.6
  const fitsDown = (n: number) => Math.abs(n - tall) < tall * 0.6
  const vertical = (x: number, y: number): number => {
    // Light, dark, light runs through (x, y) going up and down from the dark centre.
    let up = y
    while (up >= top && dark(image, x, up)) up--
    let down = y
    while (down <= bottom && dark(image, x, down)) down++
    const middle = down - up - 1
    if (!fitsDown(middle)) return NaN
    let above = 0
    for (let yy = up; yy >= top && !dark(image, x, yy); yy--) above++
    let below = 0
    for (let yy = down; yy <= bottom && !dark(image, x, yy); yy++) below++
    if (!fitsDown(above) || !fitsDown(below)) return NaN
    return (up + 1 + down) / 2
  }
  const found: { x: number; y: number; count: number }[] = []
  for (let y = top; y <= bottom; y++) {
    const runs: number[] = []
    let x = left
    while (x <= right && dark(image, x, y)) x++ // skip a dark run cut by the window
    let start = x
    let current = false
    for (; x <= right + 1; x++) {
      const d = x <= right && dark(image, x, y)
      if (x <= right && d === current) continue
      runs.push(x - start)
      start = x
      current = d
      // runs alternate light, dark, light ... ; check the last three when they end in light
      if (runs.length >= 3 && runs.length % 2 === 1) {
        const [l1, d1, l2] = runs.slice(-3) as [number, number, number]
        if (fits(l1) && fits(d1) && fits(l2)) {
          const cx = x - l2 - d1 / 2
          const cy = vertical(Math.floor(cx), y)
          if (!Number.isNaN(cy)) {
            const same = found.find((f) => Math.abs(f.x - cx) <= moduleSize && Math.abs(f.y - cy) <= moduleSize)
            if (same) {
              same.x = (same.x * same.count + cx) / (same.count + 1)
              same.y = (same.y * same.count + cy) / (same.count + 1)
              same.count++
            } else {
              found.push({ x: cx, y: cy, count: 1 })
            }
          }
        }
      }
    }
  }
  // A candidate seen on one row only counts as three modules further away.
  const score = (f: { x: number; y: number; count: number }) => distance(f, estimate) / moduleSize + (f.count >= 2 ? 0 : 3)
  return found.sort((p, q) => score(p) - score(q)).map(({ x, y }) => ({ x, y }))
}

/** A projective map from the unit square's corners to four picture points. */
function squareToQuad(p0: Point, p1: Point, p2: Point, p3: Point): number[] {
  const dx3 = p0.x - p1.x + p2.x - p3.x
  const dy3 = p0.y - p1.y + p2.y - p3.y
  if (dx3 === 0 && dy3 === 0) {
    return [p1.x - p0.x, p2.x - p1.x, p0.x, p1.y - p0.y, p2.y - p1.y, p0.y, 0, 0, 1]
  }
  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const den = dx1 * dy2 - dx2 * dy1
  const a13 = (dx3 * dy2 - dx2 * dy3) / den
  const a23 = (dx1 * dy3 - dx3 * dy1) / den
  return [
    p1.x - p0.x + a13 * p1.x, p3.x - p0.x + a23 * p3.x, p0.x,
    p1.y - p0.y + a13 * p1.y, p3.y - p0.y + a23 * p3.y, p0.y,
    a13, a23, 1,
  ]
}

function adjoint(m: readonly number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number]
  return [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d]
}

function multiply(m: readonly number[], n: readonly number[]): number[] {
  const out: number[] = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out.push(m[r * 3]! * n[c]! + m[r * 3 + 1]! * n[3 + c]! + m[r * 3 + 2]! * n[6 + c]!)
  }
  return out
}

/** The map taking four module-space points to four picture points. */
function quadToQuad(from: readonly Point[], to: readonly Point[]): (x: number, y: number) => Point {
  const toPicture = squareToQuad(to[0]!, to[1]!, to[2]!, to[3]!)
  const fromModules = adjoint(squareToQuad(from[0]!, from[1]!, from[2]!, from[3]!))
  // Column-vector convention: picture = toPicture · fromModules⁻¹ · module.
  const m = multiply(toPicture, fromModules)
  return (x, y) => {
    const w = m[6]! * x + m[7]! * y + m[8]!
    return { x: (m[0]! * x + m[1]! * y + m[2]!) / w, y: (m[3]! * x + m[4]! * y + m[5]!) / w }
  }
}

/**
 * Out of 25, how many modules around `centre` match an alignment pattern
 * (dark centre, light ring, dark ring), stepping by `u` across and `v` down.
 * Perspective changes the local module size, so three scales are tried.
 */
function alignmentScore(image: BitImage, centre: Point, u: Point, v: Point): number {
  let best = 0
  for (const scale of [0.85, 1, 1.15]) {
    let score = 0
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        const x = Math.floor(centre.x + (i * u.x + j * v.x) * scale)
        const y = Math.floor(centre.y + (i * u.y + j * v.y) * scale)
        const want = Math.max(Math.abs(i), Math.abs(j)) !== 1
        const got = x >= 0 && y >= 0 && x < image.width && y < image.height && dark(image, x, y)
        if (got === want) score++
      }
    }
    best = Math.max(best, score)
  }
  return best
}

/** The symbol's size in modules from its finders' spacing, rounded to 1 (mod 4); undefined when the modules are under a pixel. */
export function estimateSize(image: BitImage, triple: readonly [Finder, Finder, Finder]): number | undefined {
  const [topLeft, topRight, bottomLeft] = triple
  const acrossSize = runModuleSize(image, topLeft, topRight)
  const downSize = runModuleSize(image, topLeft, bottomLeft)
  if (!((acrossSize + downSize) / 2 >= 1)) return undefined
  return sizeFrom(topLeft, topRight, bottomLeft, acrossSize, downSize)
}

function sizeFrom(topLeft: Point, topRight: Point, bottomLeft: Point, acrossSize: number, downSize: number): number {
  // Each side counted in its own modules, which perspective can make differ.
  const size = Math.round((distance(topLeft, topRight) / acrossSize + distance(topLeft, bottomLeft) / downSize) / 2) + 7
  switch (size & 3) {
    case 0: return size + 1
    case 2: return size - 1
    case 3: return size - 2
    default: return size
  }
}

/**
 * Turns three finders into sampling maps: one through each likely alignment
 * pattern (when the version has one), then one through the fourth corner.
 * `sizeHint` overrides the estimated module count.
 */
export function locate(image: BitImage, triple: readonly [Finder, Finder, Finder], sizeHint?: number, work?: Work): Location[] {
  const [topLeft, topRight, bottomLeft] = triple
  const acrossSize = runModuleSize(image, topLeft, topRight)
  const downSize = runModuleSize(image, topLeft, bottomLeft)
  const moduleSize = (acrossSize + downSize) / 2
  if (!(moduleSize >= 1)) return []
  const size = sizeHint ?? sizeFrom(topLeft, topRight, bottomLeft, acrossSize, downSize)
  if (size < 21 || size > 177) return []
  // A plane seen in perspective: along a side whose far end is w times as far
  // from the camera, modules shrink by w squared. The finders' module sizes so
  // give the weights of a projective map through the three centres, which
  // places the rest of the symbol. Equal sizes give the parallelogram.
  const weight = (from: Point, to: Point): number => {
    const w = Math.sqrt(blackWhiteBlack(image, from, to) / blackWhiteBlack(image, to, from))
    return w >= 0.5 && w <= 2 ? w : 1
  }
  const wr = weight(topLeft, topRight)
  const wd = weight(topLeft, bottomLeft)
  const steps = size - 7
  /** Picture point of module-space point (x, y), measured from the top-left finder centre. */
  const perspective = (x: number, y: number): Point => {
    const a = x / steps
    const b = y / steps
    const w = 1 + a * (wr - 1) + b * (wd - 1)
    return {
      x: (topLeft.x + a * (wr * topRight.x - topLeft.x) + b * (wd * bottomLeft.x - topLeft.x)) / w,
      y: (topLeft.y + a * (wr * topRight.y - topLeft.y) + b * (wd * bottomLeft.y - topLeft.y)) / w,
    }
  }
  const parallelogram = { x: topRight.x - topLeft.x + bottomLeft.x, y: topRight.y - topLeft.y + bottomLeft.y }
  const corner = perspective(steps, steps)
  // Without an alignment pattern, the parallelogram's corner goes first, as for
  // a code seen head-on; the map's corner is a later try. A corner moved by
  // less than a pixel samples the same pixels, so it is not tried twice.
  const corners = distance(corner, parallelogram) >= 1 ? [parallelogram, corner] : [parallelogram]
  let alignments: Point[] = []
  if (size > 21) {
    // Guesses at the alignment centre, three modules in from the fourth
    // corner: through the projective map, and on the parallelogram.
    const guess = perspective(steps - 3, steps - 3)
    const k = 1 - 3 / steps
    const flat = { x: topLeft.x + k * (parallelogram.x - topLeft.x), y: topLeft.y + k * (parallelogram.y - topLeft.y) }
    const estimates = distance(guess, flat) > moduleSize ? [guess, flat] : [guess]
    // One module's steps across and down there, by the map and on the parallelogram.
    const u = { x: perspective(steps - 2, steps - 3).x - guess.x, y: perspective(steps - 2, steps - 3).y - guess.y }
    const v = { x: perspective(steps - 3, steps - 2).x - guess.x, y: perspective(steps - 3, steps - 2).y - guess.y }
    const u0 = { x: (topRight.x - topLeft.x) / steps, y: (topRight.y - topLeft.y) / steps }
    const v0 = { x: (bottomLeft.x - topLeft.x) / steps, y: (bottomLeft.y - topLeft.y) / steps }
    // A row or column crosses a turned module on the slant: at 45 degrees a
    // module's run is the diagonal, root 2 times its side.
    const det = Math.abs(u.x * v.y - u.y * v.x)
    const wide = det / Math.max(Math.abs(u.y), Math.abs(v.y))
    const tall = det / Math.max(Math.abs(u.x), Math.abs(v.x))
    // Rank candidates by how well the 5x5 pattern around them matches, read
    // along the code's own axes, then by nearness to a guess.
    const near = (p: Point) => Math.min(...estimates.map((e) => distance(p, e)))
    const scored: { p: Point; score: number; away: number }[] = []
    for (const reach of [4, 8, 16]) {
      for (const estimate of estimates) {
        for (const p of findAlignments(image, estimate, wide, tall, reach, work)) {
          if (scored.some((a) => distance(a.p, p) <= moduleSize / 2)) continue
          const score = Math.max(alignmentScore(image, p, u, v), alignmentScore(image, p, u0, v0))
          scored.push({ p, score, away: near(p) })
        }
      }
      if (scored.some((c) => c.score >= 23)) break
    }
    alignments = scored
      .filter((c) => c.score >= 20)
      .sort((a, b) => b.score - a.score || a.away - b.away)
      .slice(0, 4)
      .map((c) => c.p)
  }
  const far = size - 3.5
  const map = (alignment: Point | undefined, corner: Point): Location => {
    const project = quadToQuad(
      [{ x: 3.5, y: 3.5 }, { x: far, y: 3.5 }, alignment ? { x: size - 6.5, y: size - 6.5 } : { x: far, y: far }, { x: 3.5, y: far }],
      [topLeft, topRight, alignment ?? corner, bottomLeft],
    )
    return { topLeft, topRight, bottomLeft, alignment, size, project: (x, y) => project(x + 0.5, y + 0.5) }
  }
  return [...alignments.map((a) => map(a, corner)), ...corners.map((c) => map(undefined, c))]
}
