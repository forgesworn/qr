package dev.forgesworn.qr

import kotlin.math.abs
import kotlin.math.floor
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The reduced-size pass (SPEC.md, decoder step 9): the shrink's exact
 * arithmetic, and a close-up whose large modules carry scan lines and noise,
 * which reads only once the picture is shrunk. The same frame as
 * test/reduced.test.ts, from the same generator.
 */
class ReducedTest {
    private class Random(seed: Long) {
        private var s = seed and 0xffffffffL

        fun next(): Double {
            s = (s * 1664525L + 1013904223L) and 0xffffffffL
            return s / 4294967296.0
        }
    }

    private val text = "https://example.com/close-up"
    private val module = 24

    /**
     * The code at 24 px a module, four modules of quiet zone, a dark scan line
     * every third row across everything, and seeded noise of up to 12 either way.
     * With [invert], light and dark change places, the scan lines too.
     */
    private fun closeUp(invert: Boolean): ByteArray {
        val qr = encode(text, EncodeOptions(ecc = ErrorCorrection.M))
        val side = (qr.size + 8) * module
        val data = ByteArray(side * side)
        val random = Random(7)
        for (y in 0 until side) {
            for (x in 0 until side) {
                val mx = x / module - 4
                val my = y / module - 4
                val dark = (mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my * qr.size + mx].toInt() == 1) || y % 3 == 0
                val v = (if (dark != invert) 40 else 215) + floor((random.next() * 2 - 1) * 12).toInt()
                data[y * side + x] = maxOf(0, minOf(255, v)).toByte()
            }
        }
        return data
    }

    private val side = (encode(text, EncodeOptions(ecc = ErrorCorrection.M)).size + 8) * module

    @Test
    fun shrinksByWholeBoxesRoundingHalfUpAndDroppingTheRemainder() {
        // 5 x 3 by 2: two columns and one row, the last column and row dropped.
        val image = Luminance(intArrayOf(0, 1, 2, 3, 99, 4, 5, 6, 8, 99, 99, 99, 99, 99, 99), 5, 3)
        val small = shrink(image, 2)
        assertEquals(2, small.width)
        assertEquals(1, small.height)
        // (0 + 1 + 4 + 5 + 2) div 4 = 3; (2 + 3 + 6 + 8 + 2) div 4 = 5.
        assertArrayEquals(intArrayOf(3, 5), small.data)
        // 8 x 8 boxes: (sum + 32) div 64.
        assertArrayEquals(intArrayOf(255), shrink(Luminance(IntArray(64) { 255 }, 8, 8), 8).data)
        assertArrayEquals(intArrayOf(1), shrink(Luminance(IntArray(64) { if (it < 32) 1 else 0 }, 8, 8), 8).data)
    }

    @Test
    fun readsACloseUpWithScanLinesOnlyAtReducedSizeLocatedInTheFullPicture() {
        val work = Work()
        val got = decodeCounted(closeUp(false), side, side, work)
        assertEquals(text, got?.text)
        // The pass runs only when nothing read at full size.
        assertTrue(work.reduced > 0)
        assertTrue(work.maps <= 4 * 6 * 5 * 6)
        assertTrue(work.second <= 4)
        // The top-left finder's centre is 7.5 modules in from each edge: mapped
        // back by x * f, within a pixel.
        val topLeft = got!!.location!!.topLeft
        assertTrue(abs(topLeft.x - 7.5 * module) < 1)
        assertTrue(abs(topLeft.y - 7.5 * module) < 1)
    }

    @Test
    fun honoursTheInversionOptionAtReducedSize() {
        val work = Work()
        val got = decodeCounted(closeUp(true), side, side, work)
        assertEquals(text, got?.text)
        assertEquals(true, got?.inverted)
        assertTrue(work.reduced > 0)
        assertNull(decode(closeUp(true), side, side, inversion = Inversion.NORMAL))
        assertNull(decode(closeUp(false), side, side, inversion = Inversion.INVERTED))
    }
}
