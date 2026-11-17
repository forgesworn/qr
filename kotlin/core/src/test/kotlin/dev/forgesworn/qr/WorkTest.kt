package dev.forgesworn.qr

import kotlin.math.abs
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The search's work on frames built to be costly, counted rather than timed,
 * so the bounds hold on any machine. The counter is internal to the module.
 */
/** At most seven second looks and two searches at each of 46 lattice points. */
internal const val MESH_PROBES = 7L * 92 * 25 * 25 * 25

class WorkTest {
    private class Frame(val data: ByteArray, val width: Int, val height: Int)

    private fun perPixel(work: Work, frame: Frame) =
        (work.steps + work.compared + work.scanned).toDouble() / (frame.width.toLong() * frame.height)

    /** Finder patterns with 1 px modules on a 10 px pitch: every cell a finder, no symbol. */
    private fun tiled(width: Int, height: Int): Frame {
        val data = ByteArray(width * height) { 255.toByte() }
        for (y in 0 until height) for (x in 0 until width) {
            val i = x % 10
            val j = y % 10
            if (i < 7 && j < 7 && maxOf(abs(i - 3), abs(j - 3)) != 2) data[y * width + x] = 0
        }
        return Frame(data, width, height)
    }

    /** Full-height stripes in 1:1:3:1:1, so every row is a run of finder candidates. */
    private fun stripes(width: Int, height: Int): Frame {
        val pattern = intArrayOf(0, 255, 0, 0, 0, 255, 0, 255, 255)
        return Frame(ByteArray(width * height) { pattern[(it % width) % 9].toByte() }, width, height)
    }

    @Test
    fun growsInStepWithThePixels() {
        for (make in listOf(::tiled, ::stripes)) {
            val small = make(800, 800)
            val large = make(1600, 1600)
            val a = Work()
            val b = Work()
            assertNull(decodeCounted(small.data, small.width, small.height, a))
            assertNull(decodeCounted(large.data, large.width, large.height, b))
            assertTrue(perPixel(a, small) < 1.5)
            assertTrue(perPixel(b, large) < 1.5)
            // Four times the pixels, not much more than four times the work.
            assertTrue(perPixel(b, large) < perPixel(a, small) * 1.1)
            assertTrue(a.second + b.second <= 2 * 7)
            assertTrue(a.probed + b.probed <= 2 * MESH_PROBES)
        }
    }

    @Test
    fun noiseSamplesNoMoreMapsThanTheCapsAllow() {
        val random = java.util.Random(11)
        val frame = Frame(ByteArray(640 * 480) { random.nextInt(256).toByte() }, 640, 480)
        val work = Work()
        assertNull(decodeCounted(frame.data, frame.width, frame.height, work))
        // Four passes, six triples, five sizes, at most six maps a size.
        assertTrue(work.maps <= 4 * 6 * 5 * 6)
        // The second look reads at most seven of them again.
        assertTrue(work.second <= 7)
        // Each may search 46 lattice points twice, at 25 x 25 quarter-module
        // offsets of 25 modules each.
        assertTrue(work.probed <= MESH_PROBES)
        // Each of the 120 locates scans at most six windows, each no bigger than
        // the picture; in practice the windows cover it a few times over.
        assertTrue(perPixel(work, frame) < 8)
    }
}
