package dev.forgesworn.qr

import org.junit.Assert.assertEquals
import org.junit.Test

class TablesTest {
    /** Data and error correction modules of a version, from the symbol layout alone. */
    private fun rawModules(v: Int): Int {
        var n = (16 * v + 128) * v + 64
        if (v >= 2) {
            val align = v / 7 + 2
            n -= (25 * align - 10) * align - 55
            if (v >= 7) n -= 36
        }
        return n
    }

    @Test
    fun hasFortyVersions() {
        assertEquals(40, ALIGNMENT_CENTRES.size)
        assertEquals(40, EC_BLOCKS.size)
    }

    @Test
    fun fillsEveryVersionExactlyAtEveryLevel() {
        for (v in 1..40) {
            val codewords = rawModules(v) / 8
            assertEquals(4, EC_BLOCKS[v - 1].size)
            for (b in EC_BLOCKS[v - 1]) {
                val ec = b[0]
                val g1 = b[1]
                val d1 = b[2]
                val g2 = b[3]
                assertEquals("version $v", codewords, g1 * (d1 + ec) + g2 * (d1 + 1 + ec))
            }
        }
    }

    @Test
    fun placesAlignmentCentresFromSixToSizeMinusSeven() {
        for (v in 2..40) {
            val centres = ALIGNMENT_CENTRES[v - 1]
            assertEquals(v / 7 + 2, centres.size)
            assertEquals(6, centres[0])
            assertEquals(17 + 4 * v - 7, centres.last())
        }
    }
}
