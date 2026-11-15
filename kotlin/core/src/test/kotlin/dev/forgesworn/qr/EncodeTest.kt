package dev.forgesworn.qr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class EncodeTest {
    @Test
    fun isDarkIsFalseOutsideTheSymbol() {
        val qr = encode("HELLO WORLD", EncodeOptions(ecc = ErrorCorrection.Q))
        assertTrue(qr.isDark(0, 0))
        for ((x, y) in listOf(qr.size to 0, 0 to qr.size, -1 to 0, 0 to -1, Int.MIN_VALUE to 0, 0 to Int.MAX_VALUE)) {
            assertFalse("($x, $y)", qr.isDark(x, y))
            assertFalse("($x, $y)", isDark(qr, x, y))
        }
    }

    @Test
    fun rejectsAFixedVersionBelowMinVersion() {
        val e = assertThrows(IllegalArgumentException::class.java) { encode("A", EncodeOptions(version = 3, minVersion = 5)) }
        assertEquals("Version is below minVersion", e.message)
        assertFalse(e is QrCapacityError)
        assertEquals(5, encode("A", EncodeOptions(version = 5, minVersion = 5)).version)
        assertEquals(5, encode("A", EncodeOptions(minVersion = 5)).version)
    }
}
