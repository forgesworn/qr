package dev.forgesworn.qr

import java.lang.reflect.InvocationTargetException
import java.util.Random
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

private class ReferenceCandidate(var x: Double, var y: Double, var count: Int)
private fun referenceSign(d: Double): Int = if (d < 0) -1 else if (d > 0) 1 else 0

// Baseline implementation copied independently from fabe7f2.
private fun referenceAlignments(image: BitImage, edges: Edges, estimate: Point, wide: Double, tall: Double, reach: Int, work: Work?): List<Point> {
    val moduleSize = max(wide, tall)
    val radius = ceil(reach * moduleSize).toInt()
    val left = max(0, floor(estimate.x - radius).toInt())
    val right = min(image.width - 1, ceil(estimate.x + radius).toInt())
    val top = max(0, floor(estimate.y - radius).toInt())
    val bottom = min(image.height - 1, ceil(estimate.y + radius).toInt())
    if (right - left < moduleSize * 3 || bottom - top < moduleSize * 3) return emptyList()
    if (work != null) work.scanned += (right - left + 1).toLong() * (bottom - top + 1)
    val data = image.data
    val width = image.width
    val slack = wide * 0.6
    val slackDown = tall * 0.6
    fun vertical(x: Int, y: Int): Double {
        // Light, dark, light runs through (x, y) going up and down from the dark centre.
        var up = y
        while (up >= top && data[up * width + x].toInt() == 1) up--
        var down = y
        while (down <= bottom && data[down * width + x].toInt() == 1) down++
        val middle = down - up - 1
        if (!(abs(middle - tall) < slackDown)) return Double.NaN
        var above = 0
        var yy = up
        while (yy >= top && data[yy * width + x].toInt() != 1) {
            above++
            yy--
        }
        if (!(abs(above - tall) < slackDown)) return Double.NaN
        var below = 0
        yy = down
        while (yy <= bottom && data[yy * width + x].toInt() != 1) {
            below++
            yy++
        }
        if (!(abs(below - tall) < slackDown)) return Double.NaN
        return (up + 1 + down) / 2.0
    }
    val found = ArrayList<ReferenceCandidate>()
    for (y in top..bottom) {
        val changes = edges.row(y)
        val n = changes.size
        // The first change of colour past the window's left edge.
        var k = 0
        var high = n
        while (k < high) {
            val middle = (k + high) shr 1
            if (changes[middle] <= left) k = middle + 1 else high = middle
        }
        var x = left
        // Skip a dark run cut by the window.
        if (data[y * width + left].toInt() == 1) x = if (k < n && changes[k] <= right) changes[k++] else right + 1
        // Each candidate is a light, dark, light triple. The first two
        // runs must end inside the window; the final light run may be cut off.
        var start = x
        if (k >= n || changes[k] > right) continue
        var lightEnd = changes[k++]
        if (k >= n || changes[k] > right) continue
        var darkEnd = changes[k++]
        while (true) {
            x = if (k < n && changes[k] <= right) changes[k++] else right + 1
            val before = lightEnd - start
            val last = darkEnd - lightEnd
            val run = x - darkEnd
            if (abs(before - wide) < slack && abs(last - wide) < slack && abs(run - wide) < slack) {
                val cx = x - run - last / 2.0
                val cy = vertical(floor(cx).toInt(), y)
                if (!cy.isNaN()) {
                    val same = found.firstOrNull { abs(it.x - cx) <= moduleSize && abs(it.y - cy) <= moduleSize }
                    if (same != null) {
                        same.x = (same.x * same.count + cx) / (same.count + 1)
                        same.y = (same.y * same.count + cy) / (same.count + 1)
                        same.count++
                    } else {
                        found.add(ReferenceCandidate(cx, cy, 1))
                    }
                }
            }
            if (x > right) break
            // The trailing light run becomes the first of the next triple.
            start = darkEnd
            lightEnd = x
            if (k >= n || changes[k] > right) break
            darkEnd = changes[k++]
        }
    }
    // A candidate seen on one row only counts as three modules further away.
    fun score(f: ReferenceCandidate) = sqrt((f.x - estimate.x) * (f.x - estimate.x) + (f.y - estimate.y) * (f.y - estimate.y)) / moduleSize + (if (f.count >= 2) 0 else 3)
    return found.sortedWith { p, q -> referenceSign(score(p) - score(q)) }.map { Point(it.x, it.y) }
}


class AlignmentFrontierTest {
    private val method = Class.forName("dev.forgesworn.qr.LocateKt").getDeclaredMethod(
        "findAlignments", BitImage::class.java, Edges::class.java, Point::class.java,
        Double::class.javaPrimitiveType, Double::class.javaPrimitiveType,
        Int::class.javaPrimitiveType, Work::class.java,
    ).apply { isAccessible = true }

    private fun compare(image: BitImage, edges: Edges, estimate: Point, wide: Double, tall: Double, reach: Int): Int {
        val oldWork = Work()
        val newWork = Work()
        val expected = referenceAlignments(image, Edges(image), estimate, wide, tall, reach, oldWork)
        @Suppress("UNCHECKED_CAST")
        val actual = try {
            method.invoke(null, image, edges, estimate, wide, tall, reach, newWork) as List<Point>
        } catch (e: InvocationTargetException) {
            throw e.targetException
        }
        assertEquals(expected, actual)
        assertEquals(oldWork.scanned, newWork.scanned)
        assertEquals(oldWork.steps, newWork.steps)
        assertEquals(oldWork.compared, newWork.compared)
        assertEquals(oldWork.maps, newWork.maps)
        assertEquals(oldWork.second, newWork.second)
        assertEquals(oldWork.meshes, newWork.meshes)
        assertEquals(oldWork.probed, newWork.probed)
        assertEquals(oldWork.reduced, newWork.reduced)
        return expected.size
    }

    @Test
    fun exhaustiveSmallImagesAndClippedWindows() {
        var nonempty = 0
        for (bits in 0 until (1 shl 16)) {
            val image = BitImage(ByteArray(16) { ((bits ushr it) and 1).toByte() }, 4, 4)
            nonempty += compare(image, Edges(image), Point(1.5, 1.5), 1.0, 1.0, 4)
        }
        assertTrue("positive windows must find candidates", nonempty > 0)
    }

    @Test
    fun randomWindowsAndSharedInverseEdges() {
        val rng = Random(72931)
        var nonempty = 0
        repeat(1200) {
            val width = 8 + rng.nextInt(25)
            val height = 8 + rng.nextInt(25)
            val data = ByteArray(width * height) { rng.nextInt(2).toByte() }
            val normal = BitImage(data, width, height)
            val inverse = BitImage(ByteArray(data.size) { (1 - data[it]).toByte() }, width, height)
            val edges = Edges(normal)
            val estimate = Point(rng.nextDouble() * width, rng.nextDouble() * height)
            val wide = 0.75 + rng.nextInt(7) * 0.25
            val tall = 0.75 + rng.nextInt(7) * 0.25
            val reach = 1 + rng.nextInt(5)
            nonempty += compare(normal, edges, estimate, wide, tall, reach)
            nonempty += compare(inverse, edges, estimate, wide, tall, reach)
        }
        assertTrue("random windows must exercise accepted observations", nonempty > 0)
    }

    @Test
    fun growsActiveIdsForManySeparatedCandidates() {
        val width = 101
        val height = 9
        val image = BitImage(ByteArray(width * height) {
            if ((it % width) % 2 == 1 && (it / width) % 2 == 1) 1 else 0
        }, width, height)
        val count = compare(image, Edges(image), Point(50.0, 4.0), 1.0, 1.0, 100)
        assertTrue("fixture must grow the active ID array beyond its initial capacity", count > 32)
    }

    @Test
    fun unusualScalesFollowOriginalSearch() {
        val image = BitImage(ByteArray(81) { if ((it / 9 + it % 9) % 3 == 0) 1 else 0 }, 9, 9)
        val scales = listOf(0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, 1.25)
        for (wide in scales) for (tall in scales) {
            compare(image, Edges(image), Point(4.0, 4.0), wide, tall, 2)
        }
    }

    @Test
    fun retirementAndEarliestLookupMatchFullHistoryThroughDrift() {
        val candidateClass = Class.forName("dev.forgesworn.qr.Candidate")
        val ctor = candidateClass.getDeclaredConstructor(Double::class.javaPrimitiveType, Double::class.javaPrimitiveType, Int::class.javaPrimitiveType).apply { isAccessible = true }
        val xField = candidateClass.getDeclaredField("x").apply { isAccessible = true }
        val yField = candidateClass.getDeclaredField("y").apply { isAccessible = true }
        val countField = candidateClass.getDeclaredField("count").apply { isAccessible = true }
        val owner = Class.forName("dev.forgesworn.qr.LocateKt")
        val retire = owner.getDeclaredMethod("retireAlignmentCandidates", List::class.java, IntArray::class.java, Int::class.javaPrimitiveType, Double::class.javaPrimitiveType, Double::class.javaPrimitiveType).apply { isAccessible = true }
        val lookup = owner.getDeclaredMethod("findAlignmentCandidate", List::class.java, IntArray::class.java, Int::class.javaPrimitiveType, Double::class.javaPrimitiveType, Double::class.javaPrimitiveType, Double::class.javaPrimitiveType).apply { isAccessible = true }
        val found = ArrayList<Any>()
        val history = ArrayList<ReferenceCandidate>()
        val active = IntArray(16)
        var count = 0
        // Two candidates overlap the fifth query; the first must win. The
        // first centre's y increases and then decreases before retirement.
        val observations = listOf(
            Triple(0.0, 0.0, -2.0), Triple(1.8, 0.0, -2.0),
            Triple(0.0, 1.0, 0.0), Triple(0.0, 0.0, 0.0),
            Triple(0.9, 0.3, 0.0), Triple(0.0, 2.0, 2.0),
            Triple(0.0, 3.0, 3.0),
        )
        for ((step, observation) in observations.withIndex()) {
            val (cx, cy, lower) = observation
            count = retire.invoke(null, found, active, count, lower, 1.0) as Int
            val expected = history.indexOfFirst { abs(it.x - cx) <= 1.0 && abs(it.y - cy) <= 1.0 }
            val actual = lookup.invoke(null, found, active, count, cx, cy, 1.0)
            assertEquals("matching ID at step $step", expected, if (actual == null) -1 else found.indexOf(actual))
            if (step == 2 || step == 3 || step == 4) assertEquals(0, expected)
            if (expected < 0) {
                history.add(ReferenceCandidate(cx, cy, 1))
                active[count++] = found.size
                found.add(ctor.newInstance(cx, cy, 1))
            } else {
                val h = history[expected]
                h.x = (h.x * h.count + cx) / (h.count + 1)
                h.y = (h.y * h.count + cy) / (h.count + 1)
                h.count++
                val n = countField.getInt(actual)
                xField.setDouble(actual, (xField.getDouble(actual) * n + cx) / (n + 1))
                yField.setDouble(actual, (yField.getDouble(actual) * n + cy) / (n + 1))
                countField.setInt(actual, n + 1)
            }
            if (step == 2) assertEquals(0.5, history[0].y, 0.0)
            if (step == 3) assertEquals(1.0 / 3.0, history[0].y, 0.0)
            for (i in history.indices) {
                assertEquals(history[i].x.toBits(), xField.getDouble(found[i]).toBits())
                assertEquals(history[i].y.toBits(), yField.getDouble(found[i]).toBits())
                assertEquals(history[i].count, countField.getInt(found[i]))
            }
        }
        assertTrue("retired candidate cannot return", (0 until count).none { active[it] == 0 })
        val boundary = arrayListOf(ctor.newInstance(0.0, 0.0, 1), ctor.newInstance(1.0, -0.000001, 1))
        val ids = intArrayOf(0, 1)
        val kept = retire.invoke(null, boundary, ids, 2, 1.0, 1.0) as Int
        assertEquals(1, kept)
        assertEquals(0, ids[0])
        assertTrue(lookup.invoke(null, boundary, ids, kept, 0.0, 1.0, 1.0) === boundary[0])
    }

    @Test
    fun readsThinFinderCentresAtBothQuietMargins() {
        val qr = encode("A", EncodeOptions(version = 1, ecc = ErrorCorrection.H))
        for (centreHeight in 1..2) for (padding in 4..5) {
            val side = qr.size + 2 * padding
            val data = ByteArray(side * side) { 235.toByte() }
            for (y in 0 until qr.size) for (x in 0 until qr.size) {
                if (qr.modules[y * qr.size + x].toInt() == 1) data[(y + padding) * side + x + padding] = 20
            }
            for ((ox, oy) in listOf(0 to 0, qr.size - 7 to 0, 0 to qr.size - 7)) {
                for (y in listOf(2, 4)) for (x in 2..4) data[(padding + oy + y) * side + padding + ox + x] = 235.toByte()
                if (centreHeight == 2) data[(padding + oy + 2) * side + padding + ox + 3] = 20
                for (x in 0..6) data[(padding + oy + 7) * side + padding + ox + x] = 20
            }
            val decoded = decode(data, side, side)
            assertEquals("A", decoded?.text)
            assertArrayEquals(byteArrayOf(65), decoded?.bytes)
        }
    }
}
