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
  /**
   * The nine numbers of the projective map `project` applies to
   * (x + 0.5, y + 0.5), row by row, when it is that map and nothing more.
   */
  readonly matrix?: readonly number[] | undefined
}

/**
 * Work the search does, counted for tests that bound it: pixels stepped in
 * cross-checks, stored candidates compared while merging, pixels in the
 * windows searched for alignment patterns, maps sampled, maps read again
 * by the second look, those of them read through a mesh, and the points the
 * mesh probed looking for alignment patterns; and, when counted, the maps
 * sampled at reduced size.
 */
export interface Work {
  steps: number
  compared: number
  scanned: number
  maps: number
  second: number
  meshes: number
  probed: number
  reduced?: number
}

const NONE: readonly number[] = []

/**
 * Where each row of a black-and-white picture changes colour: for row y,
 * every x from 1 up at which the pixel differs from the one before it, in
 * order. Each row is worked out when first asked for and kept. A picture and
 * its inverse change colour at the same places, so they share one of these.
 */
export interface Edges {
  readonly row: (y: number) => Int32Array
}

export function edgesOf(image: BitImage): Edges {
  const { data, width, height } = image
  const rows: (Int32Array | undefined)[] = new Array<Int32Array | undefined>(height)
  const scratch = new Int32Array(width)
  const words = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return {
    row: (y) => {
      let edges = rows[y]
      if (edges === undefined) {
        const start = y * width
        let n = 0
        let x = 1
        for (; x + 4 <= width; x += 4) {
          let changed = words.getUint32(start + x - 1, true) ^ words.getUint32(start + x, true)
          while (changed !== 0) {
            const byte = (31 - Math.clz32(changed & -changed)) >>> 3
            scratch[n++] = x + byte
            changed &= ~(255 << (byte * 8))
          }
        }
        for (; x < width; x++) {
          if (data[start + x] !== data[start + x - 1]) scratch[n++] = x
        }
        edges = scratch.slice(0, n)
        rows[y] = edges
      }
      return edges
    },
  }
}

const dark = (image: BitImage, x: number, y: number): boolean => image.data[y * image.width + x] === 1

/**
 * The length of (dx, dy) as sqrt(dx * dx + dy * dy): two products, a sum and
 * a square root, which every language rounds the same way. A library's
 * hypot may differ in the last place from one platform to the next.
 */
const length = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy)

function distance(a: Point, b: Point): number {
  return length(a.x - b.x, a.y - b.y)
}

/** Runs in 1:1:3:1:1 proportion, each within `tolerance` of a module (the centre within three times that). */
function finderRatioScalars(c0: number, c1: number, c2: number, c3: number, c4: number, tolerance: number): boolean {
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
  const result = crossRuns(image, x, y, dx, dy, maxCount, originalTotal, tolerance)
  if (work) work.steps += crossSteps
  return result
}

/** Pixels crossRuns stepped through on its last call, for the work count. */
let crossSteps = 0

/**
 * crossCheck's walk, stepping through pixel indices. A step moves (dx, dy),
 * each 0 or 1, so the pixels the walk can visit before leaving the picture
 * are counted in advance in each direction.
 */
function crossRuns(image: BitImage, x: number, y: number, dx: number, dy: number, maxCount: number, originalTotal: number, tolerance: number): number {
  const { data, width, height } = image
  const inside = (px: number, py: number) => px >= 0 && py >= 0 && px < width && py < height
  const step = dy * width + dx
  // Going back the walk stays inside until a coordinate passes 0; going on,
  // until one reaches the picture's edge.
  let back = inside(x, y) ? Math.min(dx ? x : Infinity, dy ? y : Infinity) + 1 : 0
  let ahead = inside(x + dx, y + dy) ? Math.min(dx ? width - 1 - x : Infinity, dy ? height - 1 - y : Infinity) : 0
  let c0 = 0, c1 = 0, c2 = 0, c3 = 0, c4 = 0
  // A centre run past these lengths could not pass the checks below, so
  // stopping there loses nothing and keeps a long dark stripe from costing its
  // length. Back along the row or down the column, the total would be more
  // than twice the row's. On the diagonal, whose four outer runs stop at
  // maxCount, a centre in proportion is under 29 times maxCount (at the
  // loosest tolerance, 1.05).
  const longest = dx && dy ? 32 * (maxCount + 1) : 2 * originalTotal
  let i = y * width + x
  while (back > 0 && data[i] === 1) {
    if (++c2 > longest) { crossSteps = c2; return NaN }
    i -= step
    back--
  }
  while (back > 0 && data[i] !== 1 && c1 <= maxCount) {
    c1++
    i -= step
    back--
  }
  if (back === 0 || c1 > maxCount) { crossSteps = c1 + c2; return NaN }
  while (back > 0 && data[i] === 1 && c0 <= maxCount) {
    c0++
    i -= step
    back--
  }
  if (c0 > maxCount) { crossSteps = c0 + c1 + c2; return NaN }
  i = y * width + x + step
  let forward = 0
  while (ahead > 0 && data[i] === 1) {
    if (++c2 > longest) { crossSteps = c0 + c1 + c2; return NaN }
    forward++
    i += step
    ahead--
  }
  while (ahead > 0 && data[i] !== 1 && c3 < maxCount) {
    c3++
    i += step
    ahead--
  }
  if (ahead === 0 || c3 >= maxCount) { crossSteps = c0 + c1 + c2 + c3; return NaN }
  while (ahead > 0 && data[i] === 1 && c4 < maxCount) {
    c4++
    i += step
    ahead--
  }
  const total = c0 + c1 + c2 + c3 + c4
  crossSteps = total
  if (c4 >= maxCount) return NaN
  // A diagonal crosses the pattern at a longer stretch, so only straight lines
  // compare totals. Back along the row the stretch must match; down the column,
  // perspective can make the pattern up to twice as tall as wide, or half.
  if (dx && !dy && 5 * Math.abs(total - originalTotal) >= 2 * originalTotal) return NaN
  if (dy && !dx && (total >= 2 * originalTotal || 2 * total <= originalTotal)) return NaN
  if (!finderRatioScalars(c0, c1, c2, c3, c4, tolerance)) return NaN
  // Position along the line in steps from the start point: one step past it,
  // then each forward step of the centre and the last two runs.
  const end = 1 + forward + c3 + c4
  return end * (dx + dy > 0 ? 1 : -1) - c4 - c3 - c2 / 2
}

/**
 * Finds finder pattern candidates, most often confirmed first. `tolerance`
 * is how far a run may stray from its share, in modules; a blurred light
 * ring needs more than the default half module.
 */
export function findFinders(image: BitImage, tolerance = 0.5, work?: Work, edges: Edges = edgesOf(image)): Finder[] {
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
    const total = counts[0]! + counts[1]! + counts[2]! + counts[3]! + counts[4]!
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
  const counts = [0, 0, 0, 0, 0]
  for (let y = skip - 1; y < height; y += skip) {
    const changes = edges.row(y)
    // Each eligible window ends at a dark run. After a successful match,
    // three new dark runs are needed before another candidate can end.
    let k = (data[y * width] === 1 ? 0 : 1) + 4
    while (k <= changes.length) {
      const start = k - 4
      const a = start === 0 ? 0 : changes[start - 1]!
      const b = changes[start]!
      const c = changes[start + 1]!
      const d = changes[start + 2]!
      const e = changes[start + 3]!
      const end = k < changes.length ? changes[k]! : width
      const c0 = b - a, c1 = c - b, c2 = d - c, c3 = e - d, c4 = end - e
      if (finderRatioScalars(c0, c1, c2, c3, c4, tolerance)) {
        counts[0] = c0
        counts[1] = c1
        counts[2] = c2
        counts[3] = c3
        counts[4] = c4
        k += consider(counts, y, end) ? 6 : 2
      } else k += 2
    }
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
        const cos = Math.abs(ux * vx + uy * vy) / length(ux, uy) / length(vx, vy)
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
        if (state === 2) return length(x - sx, y - sy)
        state++
      }
      error += dy
      if (error > 0) {
        if (y === ty) break
        y += ystep
        error -= dx
      }
    }
    return state === 2 ? length(tx + xstep - sx, ty - sy) : NaN
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

/** findAlignments' run tables, reused: it is never re-entered. */
let acrossRuns: Uint8Array = new Uint8Array(64)
let downRuns: Uint8Array = new Uint8Array(64)
/** The longest run the last acceptRuns call accepted, or -1 for none. */
let acceptedLast = -1

/**
 * Fills `table` with the integer run lengths r for which |r - size| < slack,
 * 1 for accepted, and sets acceptedLast to the longest. Each entry applies the
 * test itself, so a lookup at or below acceptedLast decides exactly as the
 * test would; entries past it are never read. Returns the table, grown if it
 * was too short.
 */
function acceptRuns(table: Uint8Array, size: number, slack: number, longest: number): Uint8Array {
  // Past size + slack + 1 no run can pass, nor past `longest`, the longest
  // run the picture can hold; NaN or infinite sizes accept none.
  const limit = Number.isFinite(size + slack) && size + slack >= 0 ? Math.min(Math.ceil(size + slack) + 1, longest) : 0
  if (table.length < limit + 1) table = new Uint8Array(limit + 1)
  let last = -1
  for (let r = 0; r <= limit; r++) {
    const ok = Math.abs(r - size) < slack
    table[r] = ok ? 1 : 0
    if (ok) last = r
  }
  acceptedLast = last
  return table
}

/**
 * Searches near `estimate` for alignment pattern centres, whose modules span
 * `wide` pixels along a row and `tall` down a column. Candidates seen on two
 * or more rows come first, then nearest the estimate.
 */
function findAlignments(image: BitImage, edges: Edges, estimate: Point, wide: number, tall: number, reach: number, work?: Work): Point[] {
  const moduleSize = Math.max(wide, tall)
  const radius = Math.ceil(reach * moduleSize)
  const left = Math.max(0, Math.floor(estimate.x - radius))
  const right = Math.min(image.width - 1, Math.ceil(estimate.x + radius))
  const top = Math.max(0, Math.floor(estimate.y - radius))
  const bottom = Math.min(image.height - 1, Math.ceil(estimate.y + radius))
  if (right - left < moduleSize * 3 || bottom - top < moduleSize * 3) return []
  if (work) work.scanned += (right - left + 1) * (bottom - top + 1)
  const data = image.data
  const width = image.width
  const slack = wide * 0.6
  const slackDown = tall * 0.6
  // The run lengths each test accepts, found by applying the test itself to
  // every integer up to the first one past its bound.
  const longest = Math.max(image.width, image.height) + 2
  const across = acrossRuns = acceptRuns(acrossRuns, wide, slack, longest)
  const longestAcross = acceptedLast
  const downward = downRuns = acceptRuns(downRuns, tall, slackDown, longest)
  const longestDown = acceptedLast
  const vertical = (x: number, y: number): number => {
    // Light, dark, light runs through (x, y) going up and down from the dark centre.
    // The centre pixel is dark, so the dark run spans at least y - up and
    // down - y; a span past the longest accepted run cannot pass.
    let up = y
    while (up >= top && data[up * width + x] === 1) {
      if (y - --up > longestDown) return NaN
    }
    let down = y
    while (down <= bottom && data[down * width + x] === 1) {
      if (++down - y > longestDown) return NaN
    }
    const middle = down - up - 1
    if (!(middle <= longestDown && downward[middle] === 1)) return NaN
    let above = 0
    for (let yy = up; yy >= top && data[yy * width + x] !== 1; yy--) if (++above > longestDown) return NaN
    if (downward[above] !== 1) return NaN
    let below = 0
    for (let yy = down; yy <= bottom && data[yy * width + x] !== 1; yy++) if (++below > longestDown) return NaN
    if (downward[below] !== 1) return NaN
    return (up + 1 + down) / 2
  }
  const found: { x: number; y: number; count: number }[] = []
  // Indices of candidates that can still match, in the order found. Rows only
  // move down, so a candidate more than a module above every later centre can
  // never match again; leaving it out of the merge search changes nothing.
  const active: number[] = []
  let lastAcceptedRow = -1
  for (let y = top; y <= bottom; y++) {
    const changes = edges.row(y)
    const n = changes.length
    // The first change of colour past the window's left edge.
    let k = 0
    for (let high = n; k < high; ) {
      const middle = (k + high) >> 1
      if (changes[middle]! <= left) k = middle + 1
      else high = middle
    }
    let x = left
    if (data[y * width + left] === 1) x = k < n && changes[k]! <= right ? changes[k++]! : right + 1 // skip a dark run cut by the window
    // Enumerate each light, dark, light window. The final light run may
    // be clipped by the window's right edge.
    let start = x
    while (k + 1 < n && changes[k + 1]! <= right) {
      const darkStart = changes[k]!
      const darkEnd = changes[k + 1]!
      const end = k + 2 < n && changes[k + 2]! <= right ? changes[k + 2]! : right + 1
      const before = darkStart - start
      const middle = darkEnd - darkStart
      const after = end - darkEnd
      if (before <= longestAcross && middle <= longestAcross && after <= longestAcross &&
          across[before] === 1 && across[middle] === 1 && across[after] === 1) {
        const cx = end - after - middle / 2
        const cy = vertical(Math.floor(cx), y)
        if (!Number.isNaN(cy)) {
          if (lastAcceptedRow !== y) {
            // An accepted dark run is shorter than 2 * ceil(tall), so this and
            // every later row's centres lie at or below `lower`.
            const lower = y - Math.ceil(tall)
            let kept = 0
            for (let a = 0; a < active.length; a++) {
              const i = active[a]!
              const fy = found[i]!.y
              if (!(fy < lower && Math.abs(fy - lower) > moduleSize)) active[kept++] = i
            }
            active.length = kept
            lastAcceptedRow = y
          }
          let same: { x: number; y: number; count: number } | undefined
          for (const i of active) {
            const f = found[i]!
            if (Math.abs(f.x - cx) <= moduleSize && Math.abs(f.y - cy) <= moduleSize) {
              same = f
              break
            }
          }
          if (same) {
            same.x = (same.x * same.count + cx) / (same.count + 1)
            same.y = (same.y * same.count + cy) / (same.count + 1)
            same.count++
          } else {
            active.push(found.length)
            found.push({ x: cx, y: cy, count: 1 })
          }
        }
      }
      start = darkEnd
      k += 2
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

/** The matrix of the map taking four module-space points to four picture points. */
function quadMatrix(from: readonly Point[], to: readonly Point[]): number[] {
  const toPicture = squareToQuad(to[0]!, to[1]!, to[2]!, to[3]!)
  const fromModules = adjoint(squareToQuad(from[0]!, from[1]!, from[2]!, from[3]!))
  // Column-vector convention: picture = toPicture · fromModules⁻¹ · module.
  return multiply(toPicture, fromModules)
}

/** The map of a matrix quadMatrix() gives. */
function projective(m: readonly number[]): (x: number, y: number) => Point {
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
const ALIGNMENT_SCALES = [0.85, 1, 1.15] as const
/** Whether module (i, j) of the 5x5 pattern, row by row from (-2, -2), is dark. */
const ALIGNMENT_DARK = Uint8Array.from({ length: 25 }, (_, k) => Math.max(Math.abs((k % 5) - 2), Math.abs(Math.floor(k / 5) - 2)) !== 1 ? 1 : 0)

/** locateImpl's offsets along the map's axes and the parallelogram's, reused: it is never re-entered. */
const MAP_OFFSETS = new Float64Array(150)
const FLAT_OFFSETS = new Float64Array(150)

/**
 * Fills `out` with the picture offsets `(i * u + j * v) * scale` of the 5x5
 * pattern's modules at each scale, x then y, computed as alignmentScore once
 * computed them, so that adding a centre gives the same sample points.
 */
function alignmentOffsets(u: Point, v: Point, out: Float64Array): Float64Array {
  let k = 0
  for (const scale of ALIGNMENT_SCALES) {
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        out[k++] = (i * u.x + j * v.x) * scale
        out[k++] = (i * u.y + j * v.y) * scale
      }
    }
  }
  return out
}

function alignmentScore(image: BitImage, centre: Point, offsets: Float64Array, best = 0): number {
  const { data, width, height } = image
  const { x: cx, y: cy } = centre
  for (let s = 0; s < 3; s++) {
    if (best === 25) break
    let score = 0
    for (let m = 0; m < 25; m++) {
      const k = (s * 25 + m) * 2
      const x = Math.floor(cx + offsets[k]!)
      const y = Math.floor(cy + offsets[k + 1]!)
      const got = x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1
      if (got === (ALIGNMENT_DARK[m] === 1)) score++
      // Even perfect remaining modules cannot improve the best score.
      else if (score + 24 - m <= best) break
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
export function locate(image: BitImage, triple: readonly [Finder, Finder, Finder], sizeHint?: number, work?: Work, edges: Edges = edgesOf(image)): Location[] {
  return locateImpl(image, triple, sizeHint, work, edges, false)
}

/** The original corner maps, without alignment searches. */
export function locateCorners(image: BitImage, triple: readonly [Finder, Finder, Finder], sizeHint?: number, edges: Edges = edgesOf(image)): Location[] {
  return locateImpl(image, triple, sizeHint, undefined, edges, true)
}

function locateImpl(image: BitImage, triple: readonly [Finder, Finder, Finder], sizeHint: number | undefined, work: Work | undefined, edges: Edges, cornersOnly: boolean): Location[] {
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
  if (size > 21 && !cornersOnly) {
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
    const offsets = alignmentOffsets(u, v, MAP_OFFSETS)
    const offsets0 = alignmentOffsets(u0, v0, FLAT_OFFSETS)
    for (const reach of [4, 8, 16]) {
      for (const estimate of estimates) {
        for (const p of findAlignments(image, edges, estimate, wide, tall, reach, work)) {
          // A point outside the enclosing square cannot be within the circle.
          const radius = moduleSize / 2
          if (scored.some((a) => Math.abs(a.p.x - p.x) <= radius && Math.abs(a.p.y - p.y) <= radius && distance(a.p, p) <= radius)) continue
          // Scores below 20 are discarded, but their points still suppress duplicates.
          const score = alignmentScore(image, p, offsets0, alignmentScore(image, p, offsets, 19))
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
    const matrix = quadMatrix(
      [{ x: 3.5, y: 3.5 }, { x: far, y: 3.5 }, alignment ? { x: size - 6.5, y: size - 6.5 } : { x: far, y: far }, { x: 3.5, y: far }],
      [topLeft, topRight, alignment ?? corner, bottomLeft],
    )
    const project = projective(matrix)
    return { topLeft, topRight, bottomLeft, alignment, size, project: (x, y) => project(x + 0.5, y + 0.5), matrix }
  }
  return [...alignments.map((a) => map(a, corner)), ...corners.map((c) => map(undefined, c))]
}
