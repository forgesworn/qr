package dev.forgesworn.qr

import kotlin.math.abs
import kotlin.math.floor

// The second look (SPEC.md, decoder step 8): when the ordinary search finds
// nothing, a few maps whose format information already agrees are read again
// with their module centres moved onto the edges the picture shows, sampling
// grey rather than black and white.

/** Both format copies within this many bits of the same format word. */
private const val AGREEMENT = 2

/** Maps read again, at most, per decode. */
internal const val SECOND_LOOKS = 4

private class Format(val bits: Int, val ecc: ErrorCorrection, val mask: Int)

private val FORMAT_WORDS: List<Format> = EC_ORDER.flatMap { ecc -> (0..7).map { mask -> Format(formatBits(ecc, mask), ecc, mask) } }

/** How a map's format copies agree. */
internal class Agreement(val mirrored: Boolean, val ecc: ErrorCorrection, val mask: Int, val distance: Int)

/** A map the ordinary read could not use, whose format copies agree. */
internal class Retry(val location: Placement, val inverted: Boolean, val agreed: Agreement)

/**
 * The format word both copies are nearest, read from sampled modules, when
 * both lie within AGREEMENT bits of it; straight before mirrored, and within
 * each the first word in level and mask order.
 */
internal fun agreement(modules: ByteArray, size: Int): Agreement? {
    var best: Agreement? = null
    for (mirrored in booleanArrayOf(false, true)) {
        fun at(x: Int, y: Int): Boolean = (if (mirrored) modules[x * size + y] else modules[y * size + x]).toInt() == 1
        var first = 0
        var second = 0
        for (i in 14 downTo 0) {
            first = (first shl 1) or (if (at(FORMAT_COORDS[i][0], FORMAT_COORDS[i][1])) 1 else 0)
            val x = if (i < 8) size - 1 - i else 8
            val y = if (i < 8) 8 else size - 7 + (i - 8)
            second = (second shl 1) or (if (at(x, y)) 1 else 0)
        }
        for (f in FORMAT_WORDS) {
            val distance = maxOf(Integer.bitCount(f.bits xor first), Integer.bitCount(f.bits xor second))
            if (distance <= AGREEMENT && (best == null || distance < best.distance)) best = Agreement(mirrored, f.ecc, f.mask, distance)
        }
    }
    return best
}

/**
 * False when a version block, read in the orientation the format copies
 * agreed in, decodes to a version whose size is not the map's: readSymbol
 * rejects such a map, so it is no candidate. A block that does not decode
 * leaves the size to decide, as in readSymbol.
 */
internal fun sized(modules: ByteArray, size: Int, mirrored: Boolean): Boolean {
    val version =
        if (mirrored) readVersion({ x, y -> modules[x * size + y].toInt() == 1 }, size)
        else readVersion({ x, y -> modules[y * size + x].toInt() == 1 }, size)
    return version == null || 17 + 4 * version == size
}

/** Keeps the best SECOND_LOOKS candidates: least distance first, then the order found. */
internal fun keep(list: MutableList<Retry>, candidate: Retry) {
    var i = list.size
    while (i > 0 && list[i - 1].agreed.distance > candidate.agreed.distance) i--
    if (i >= SECOND_LOOKS) return
    list.add(i, candidate)
    if (list.size > SECOND_LOOKS) list.removeAt(list.size - 1)
}

/** Darkness at a picture point: positive for dark, from the grey against the binariser's threshold. */
private class Probe(private val image: Luminance, private val t: Thresholds, private val inverted: Boolean) {
    fun at(x: Double, y: Double): Double {
        val width = image.width
        val height = image.height
        val data = image.data
        // Outside the picture counts as light, as in the ordinary read.
        if (!(x >= 0 && y >= 0 && x < width && y < height)) return -1.0
        // Bilinear grey, with pixel centres at i + 0.5.
        val fx = x - 0.5
        val fy = y - 0.5
        val x0 = maxOf(0.0, minOf((width - 1).toDouble(), floor(fx))).toInt()
        val y0 = maxOf(0.0, minOf((height - 1).toDouble(), floor(fy))).toInt()
        val x1 = minOf(width - 1, x0 + 1)
        val y1 = minOf(height - 1, y0 + 1)
        val ax = maxOf(0.0, minOf(1.0, fx - x0))
        val ay = maxOf(0.0, minOf(1.0, fy - y0))
        val top = data[y0 * width + x0] * (1 - ax) + data[y0 * width + x1] * ax
        val bottom = data[y1 * width + x0] * (1 - ax) + data[y1 * width + x1] * ax
        val grey = top * (1 - ay) + bottom * ay
        val d = thresholdAt(t, width, height, floor(x).toInt(), floor(y).toInt()) - grey
        return if (inverted) -d else d
    }
}

private const val STEP = 1.0 / 16

/**
 * Walks one timing pattern from module 8 to size - 9, finding each module's
 * run of its colour near where the last one was, and returns each module's
 * offset along the line in modules (0 where the finders are). A run under
 * 0.4 or over 1.6 modules is no measurement; gaps are filled from their
 * neighbours after a median of three.
 */
private fun walk(size: Int, along: (Int) -> Point, next: (Int) -> Point, probe: Probe): DoubleArray {
    val measured = DoubleArray(size) { Double.NaN }
    var prior = 0.0
    for (k in 8..size - 9) {
        val p = along(k)
        val q = next(k)
        val ux = q.x - p.x
        val uy = q.y - p.y
        val dark = k % 2 == 0
        fun right(t: Double): Boolean {
            val d = probe.at(p.x + ux * t, p.y + uy * t)
            return if (dark) d > 0 else d <= 0
        }
        var seed = Double.NaN
        var s = 0
        while (s <= 12 && seed.isNaN()) {
            if (s == 0) {
                if (right(prior)) seed = prior
            } else if (right(prior - s * STEP)) {
                seed = prior - s * STEP
            } else if (right(prior + s * STEP)) {
                seed = prior + s * STEP
            }
            s++
        }
        if (seed.isNaN()) continue
        var a = seed
        var b = seed
        while (a - seed > -1.6 && right(a - STEP)) a -= STEP
        while (b - seed < 1.6 && right(b + STEP)) b += STEP
        val width = b - a + STEP
        if (width < 0.4 || width > 1.6) continue
        measured[k] = (a + b) / 2
        prior = measured[k]
    }
    val out = DoubleArray(size)
    for (k in 0 until size) {
        if (k < 8 || k > size - 9) continue
        // Sorted by insertion, so both ports order equal values alike.
        val near = ArrayList<Double>(3)
        for (v in doubleArrayOf(measured[k - 1], measured[k], measured[k + 1])) {
            if (v.isNaN()) continue
            var i = near.size
            while (i > 0 && near[i - 1] > v) i--
            near.add(i, v)
        }
        out[k] = if (near.isNotEmpty()) near[near.size / 2] else Double.NaN
    }
    for (k in 0 until size) {
        if (!out[k].isNaN()) continue
        var l = k - 1
        while (l >= 0 && out[l].isNaN()) l--
        var r = k + 1
        while (r < size && out[r].isNaN()) r++
        val lv = if (l >= 0) out[l] else 0.0
        val rv = if (r < size) out[r] else 0.0
        out[k] = if (l < 0) rv else if (r >= size) lv else lv + ((rv - lv) * (k - l)) / (r - l)
    }
    return out
}

/**
 * Where the colour changes between two module centres, as an offset in
 * modules from the midpoint, searched in sixteenths from the first centre;
 * null if the first centre is not the colour expected.
 */
private fun edge(from: Point, to: Point, darkFrom: Boolean, probe: Probe): Double? {
    var previous = 0.0
    for (s in 0..16) {
        val t = s / 16.0
        val d = probe.at(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
        if (if (darkFrom) d > 0 else d <= 0) {
            previous = d
            continue
        }
        if (s == 0) return null
        val f = if (previous == d) 0.5 else previous / (previous - d)
        return (s - 1) / 16.0 + maxOf(0.0, minOf(1.0, f)) / 16 - 0.5
    }
    return null
}

/** A least-squares line through (index, offset) pairs; zero with fewer than three. */
private class Line(points: List<Double>) {
    private val a: Double
    private val b: Double

    init {
        val n = points.size / 2
        if (n < 3) {
            a = 0.0
            b = 0.0
        } else {
            var sx = 0.0
            var sy = 0.0
            var sxx = 0.0
            var sxy = 0.0
            for (i in points.indices step 2) {
                val x = points[i]
                val y = points[i + 1]
                sx += x
                sy += y
                sxx += x * x
                sxy += x * y
            }
            val den = n * sxx - sx * sx
            b = if (den == 0.0) 0.0 else (n * sxy - sx * sy) / den
            a = (sy - b * sx) / n
        }
    }

    fun at(t: Int): Double = a + b * t
}

/** Furthest an alignment pattern is looked for from its prediction, in modules either way. */
private const val REACH = 3

/** Steps of the search, a quarter module. */
private const val QUARTER = 4

/** Of the 25 modules of an alignment pattern, how many must match for it to count as found. */
private const val FOUND = 24

/**
 * The map bent onto the alignment patterns the picture shows (decoder step 8,
 * the mesh). Each pattern of the version's lattice is looked for near where
 * its neighbours, already placed, say it is, working outward from the
 * finders; its offset from the map, in modules, is the centre of the offsets
 * where the most of its 25 modules match. A pattern matched by fewer than
 * FOUND modules, or whose best offsets spread or reach the window's edge, is
 * doubtful and takes its neighbours' prediction. Offsets between lattice
 * points are interpolated bilinearly, and held at the outermost row and
 * column beyond them. Null below version 7, or when no pattern is found.
 */
private fun mesh(location: Placement, probe: Probe, work: Work?): Placement? {
    val size = location.size
    val version = (size - 17) / 4
    if (version < 1 || version > 40) return null
    val c = ALIGNMENT_CENTRES[version - 1]
    if (c.size < 3) return null
    val n = c.size
    val ox = DoubleArray(n * n)
    val oy = DoubleArray(n * n)
    // 0 not yet placed; 1 a finder's corner, placed by the map; 2 found; 3 predicted.
    val state = IntArray(n * n)
    state[0] = 1
    state[n - 1] = 1
    state[(n - 1) * n] = 1
    // Lattice steps to the nearest finder; row, then column, on a tie.
    fun away(i: Int): Int {
        val q = i % n
        val r = i / n
        return minOf(q + r, n - 1 - q + r, q + n - 1 - r)
    }
    val order = (0 until n * n).filter { state[it] == 0 }.sortedWith(compareBy<Int>({ away(it) }, { it }))
    val steps = REACH * QUARTER
    var found = 0
    for (i in order) {
        val q = i % n
        val r = i / n
        // The prediction: the mean offset of the neighbours already placed.
        var px = 0.0
        var py = 0.0
        var k = 0
        for ((a, b) in arrayOf(intArrayOf(q - 1, r), intArrayOf(q + 1, r), intArrayOf(q, r - 1), intArrayOf(q, r + 1))) {
            if (a < 0 || b < 0 || a >= n || b >= n || state[b * n + a] == 0) continue
            px += ox[b * n + a]
            py += oy[b * n + a]
            k++
        }
        if (k > 0) {
            px /= k
            py /= k
        }
        val cx = c[q] + px
        val cy = c[r] + py
        var best = -1
        var sx = 0
        var sy = 0
        var count = 0
        var low = 0
        var high = 0
        var lowY = 0
        var highY = 0
        for (j in -steps..steps) {
            for (s in -steps..steps) {
                val u = s.toDouble() / QUARTER
                val v = j.toDouble() / QUARTER
                var score = 0
                for (b in -2..2) {
                    for (a in -2..2) {
                        val p = location.at(cx + u + a, cy + v + b)
                        if ((probe.at(p.x, p.y) > 0) == (maxOf(abs(a), abs(b)) != 1)) score++
                    }
                }
                if (score > best) {
                    best = score
                    sx = 0
                    sy = 0
                    count = 0
                    low = s
                    high = s
                    lowY = j
                    highY = j
                }
                if (score == best) {
                    sx += s
                    sy += j
                    count++
                    low = minOf(low, s)
                    high = maxOf(high, s)
                    lowY = minOf(lowY, j)
                    highY = maxOf(highY, j)
                }
            }
        }
        if (work != null) work.probed += ((2 * steps + 1) * (2 * steps + 1) * 25).toLong()
        // In quarter modules: the best offsets' centre, and how far they spread from it.
        val mx = sx.toDouble() / count
        val my = sy.toDouble() / count
        val spread = maxOf(maxOf(mx - low, high - mx), maxOf(my - lowY, highY - my))
        if (best >= FOUND && spread <= 3 && abs(mx) <= steps - 1 && abs(my) <= steps - 1) {
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
    if (found == 0) return null
    if (work != null) work.meshes++
    fun cell(z: Double): Pair<Int, Double> {
        val t = maxOf(c[0].toDouble(), minOf(c[n - 1].toDouble(), z))
        var i = 0
        while (i < n - 2 && t > c[i + 1]) i++
        return Pair(i, (t - c[i]) / (c[i + 1] - c[i]))
    }
    val bent = { x: Double, y: Double ->
        val (i, s) = cell(x)
        val (j, t) = cell(y)
        val o = j * n + i
        val dx = (1 - t) * ((1 - s) * ox[o] + s * ox[o + 1]) + t * ((1 - s) * ox[o + n] + s * ox[o + n + 1])
        val dy = (1 - t) * ((1 - s) * oy[o] + s * oy[o + 1]) + t * ((1 - s) * oy[o + n] + s * oy[o + n + 1])
        location.at(x + dx, y + dy)
    }
    return Placement(location.topLeft, location.topRight, location.bottomLeft, location.alignment, size, bent)
}

/** Reads one candidate again; the result must keep the level and mask its format copies agreed on. */
internal fun secondLook(image: Luminance, t: Thresholds, candidate: Retry, work: Work? = null): Payload? {
    val mirrored = candidate.agreed.mirrored
    val probe = Probe(image, t, candidate.inverted)
    // 0. From version 7, the map bent onto the alignment patterns it can find.
    val location = mesh(candidate.location, probe, work) ?: candidate.location
    val size = location.size
    // 1. The timing patterns: shift whole columns and rows by what they show.
    val cols = walk(size, { k -> location.project(k, 6) }, { k -> location.project(k + 1, 6) }, probe)
    val rows = walk(size, { k -> location.project(6, k) }, { k -> location.project(6, k + 1) }, probe)
    val centres = ArrayList<Point>(size * size)
    for (y in 0 until size) for (x in 0 until size) centres.add(location.at(x + cols[x], y + rows[y]))
    fun at(x: Int, y: Int): Point = centres[y * size + x]
    val grid = ByteArray(size * size)
    for (i in grid.indices) grid[i] = if (probe.at(centres[i].x, centres[i].y) > 0) 1 else 0
    // 2. Each boundary between unlike neighbours: where the edge really is, as a line along the boundary.
    val across = ArrayList<Line>(size - 1)
    val down = ArrayList<Line>(size - 1)
    for (i in 0 until size - 1) {
        val pointsAcross = ArrayList<Double>()
        val pointsDown = ArrayList<Double>()
        for (j in 0 until size) {
            val a = grid[j * size + i]
            if (a != grid[j * size + i + 1]) {
                val o = edge(at(i, j), at(i + 1, j), a.toInt() == 1, probe)
                if (o != null) {
                    pointsAcross.add(j.toDouble())
                    pointsAcross.add(o)
                }
            }
            val b = grid[i * size + j]
            if (b != grid[(i + 1) * size + j]) {
                val o = edge(at(j, i), at(j, i + 1), b.toInt() == 1, probe)
                if (o != null) {
                    pointsDown.add(j.toDouble())
                    pointsDown.add(o)
                }
            }
        }
        across.add(Line(pointsAcross))
        down.add(Line(pointsDown))
    }
    // 3. Each module centre moves by the mean of its two boundaries' offsets; sample grey there.
    val modules = ByteArray(size * size)
    for (y in 0 until size) {
        for (x in 0 until size) {
            val dx = if (x == 0) across[0].at(y) else if (x == size - 1) across[size - 2].at(y) else (across[x - 1].at(y) + across[x].at(y)) / 2
            val dy = if (y == 0) down[0].at(x) else if (y == size - 1) down[size - 2].at(x) else (down[y - 1].at(x) + down[y].at(x)) / 2
            val p = location.at(x + cols[x] + dx, y + rows[y] + dy)
            modules[y * size + x] = if (probe.at(p.x, p.y) > 0) 1 else 0
        }
    }
    val result =
        if (mirrored) readSymbol({ x, y -> modules[x * size + y].toInt() == 1 }, size)
        else readSymbol({ x, y -> modules[y * size + x].toInt() == 1 }, size)
    if (result == null || result.ecc != candidate.agreed.ecc || result.mask != candidate.agreed.mask) return null
    return result
}
