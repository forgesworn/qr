package dev.forgesworn.qr

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

/** Reads one candidate again; the result must keep the level and mask its format copies agreed on. */
internal fun secondLook(image: Luminance, t: Thresholds, candidate: Retry): Payload? {
    val location = candidate.location
    val mirrored = candidate.agreed.mirrored
    val size = location.size
    val probe = Probe(image, t, candidate.inverted)
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
