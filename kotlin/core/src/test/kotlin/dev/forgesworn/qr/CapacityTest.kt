package dev.forgesworn.qr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class CapacityTest {
    private fun options(ecc: ErrorCorrection = ErrorCorrection.L, version: Int? = null, mode: Mode? = null) =
        EncodeOptions(ecc = ecc, version = version, mode = mode)

    @Test
    fun stillEncodesTheLargestInputOfEachKindAtVersion40L() {
        assertEquals(40, encode("7".repeat(7089), options()).version)
        assertEquals(Mode.NUMERIC, encode("7".repeat(7089), options()).mode)
        assertEquals(40, encode("A".repeat(4296), options()).version)
        assertEquals(Mode.ALPHANUMERIC, encode("A".repeat(4296), options()).mode)
        assertEquals(40, encode(ByteArray(2953), options()).version)
        assertEquals(40, encode("a".repeat(2953), options()).version)
    }

    @Test
    fun refusesInputOnePastTheLargestWithTheUsualCapacityError() {
        val over = listOf<() -> QrCode>(
            { encode("7".repeat(7090), options()) },
            { encode("A".repeat(4297), options()) },
            { encode(ByteArray(2954), options()) },
            { encode("a".repeat(2954), options()) },
        )
        for (run in over) {
            val e = assertThrows(QrCapacityError::class.java) { run() }
            assertEquals("Data does not fit any version at level L", e.message)
        }
    }

    @Test
    fun refusesHugeInputWithQrCapacityError() {
        val huge = "a".repeat(20_000_000)
        assertThrows(QrCapacityError::class.java) { encode(ByteArray(10_000_000)) }
        assertThrows(QrCapacityError::class.java) { encode(huge) }
        assertThrows(QrCapacityError::class.java) { encode(huge, EncodeOptions(mode = Mode.BYTE)) }
        assertThrows(QrCapacityError::class.java) { encode("7".repeat(20_000_000), EncodeOptions(mode = Mode.NUMERIC)) }
        assertThrows(QrCapacityError::class.java) { encode("A".repeat(20_000_000), EncodeOptions(mode = Mode.ALPHANUMERIC)) }
        assertThrows(QrCapacityError::class.java) { encode("7".repeat(20_000_000)) }
        assertThrows(QrCapacityError::class.java) { encode("😀".repeat(10_000_000)) }
        assertThrows(QrCapacityError::class.java) { encode(ByteArray(10_000_000), options(ErrorCorrection.H, version = 40)) }
    }

    @Test
    fun namesTheFixedVersionWhenOneWasAskedFor() {
        val a = assertThrows(QrCapacityError::class.java) { encode(ByteArray(10_000_000), EncodeOptions(version = 12)) }
        assertEquals("Data does not fit version 12 at level M", a.message)
        val b = assertThrows(QrCapacityError::class.java) {
            encode("a".repeat(20_000_000), EncodeOptions(ecc = ErrorCorrection.Q, version = 3, mode = Mode.BYTE))
        }
        assertEquals("Data does not fit version 3 at level Q", b.message)
    }

    @Test
    fun reportsAnArgumentErrorBeforeACapacityError() {
        val e = assertThrows(IllegalArgumentException::class.java) { encode(ByteArray(10_000_000), EncodeOptions(mode = Mode.NUMERIC)) }
        assertEquals("Bytes can only be encoded in byte mode", e.message)
    }

    @Test
    fun checksLengthBeforeContentForANamedMode() {
        assertThrows(QrCapacityError::class.java) { encode("x".repeat(100), options(version = 1, mode = Mode.NUMERIC)) }
        assertThrows(QrCapacityError::class.java) { encode("x".repeat(100), options(version = 1, mode = Mode.ALPHANUMERIC)) }
        val e = assertThrows(IllegalArgumentException::class.java) { encode("x", EncodeOptions(mode = Mode.NUMERIC)) }
        assertEquals(IllegalArgumentException::class.java, e.javaClass)
    }

    @Test
    fun neverRefusesWhatFitsTheExactMaximumOfEachModeEncodesAtSampledVersionsAndLevels() {
        fun cost(mode: Mode, k: Int): Int = when (mode) {
            Mode.BYTE -> 8 * k
            Mode.NUMERIC -> 10 * (k / 3) + intArrayOf(0, 4, 7)[k % 3]
            Mode.ALPHANUMERIC -> 11 * (k / 2) + 6 * (k % 2)
        }
        val head = mapOf(
            Mode.NUMERIC to intArrayOf(10, 12, 14),
            Mode.ALPHANUMERIC to intArrayOf(9, 11, 13),
            Mode.BYTE to intArrayOf(8, 16, 16),
        )
        for (ecc in ErrorCorrection.values()) {
            for (version in listOf(1, 2, 9, 10, 26, 27, 39, 40)) {
                val b = blocksFor(version, ecc)
                val bits = (b[1] * b[2] + b[3] * (b[2] + 1)) * 8
                for ((mode, ch) in listOf(Mode.NUMERIC to "7", Mode.ALPHANUMERIC to "A", Mode.BYTE to "a")) {
                    val header = 4 + head[mode]!![countBand(version)]
                    var n = 0
                    while (header + cost(mode, n + 1) <= bits) n++
                    val label = "$version-$ecc $mode"
                    assertEquals(label, version, encode(ch.repeat(n), EncodeOptions(ecc = ecc, version = version, mode = mode)).version)
                    assertThrows(label, QrCapacityError::class.java) {
                        encode(ch.repeat(n + 1), EncodeOptions(ecc = ecc, version = version, mode = mode))
                    }
                }
            }
        }
    }
}
