package dev.forgesworn.qr

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class SymbolTest {
    private fun reader(m: ByteArray, size: Int) = ModuleReader { x, y -> m[y * size + x].toInt() == 1 }

    @Test
    fun readsEveryZxingVector() {
        for (v in encodeVectors()) {
            val m = fromRows(v.rows, v.size)
            val got = readSymbol(reader(m, v.size), v.size)
            assertNotNull(v.id, got)
            assertEquals(v.id, v.text, got!!.text)
            assertEquals(v.id, v.version, got.version)
            assertEquals(v.id, v.ecc, got.ecc)
            assertEquals(v.id, v.mask, got.mask)
            assertEquals(v.id, 0, got.corrected)
        }
    }

    @Test
    fun readsArbitraryBytesAndReportsEci() {
        val bytes = ByteArray(256) { it.toByte() }
        val qr = encode(bytes)
        assertArrayEquals(bytes, readSymbol(reader(qr.modules, qr.size), qr.size)!!.bytes)
        val eci = encode("café", EncodeOptions(eci = true))
        val got = readSymbol(reader(eci.modules, eci.size), eci.size)!!
        assertEquals("café", got.text)
        assertEquals(listOf(26), got.eci)
    }

    @Test
    fun readsNonAsciiTextWithoutEciAsUtf8() {
        val text = "naïve ☃ 😀"
        val qr = encode(text)
        assertEquals(text, readSymbol(reader(qr.modules, qr.size), qr.size)!!.text)
    }

    /** Flips the first bit of the first [n] codewords of every block, walking the zigzag as the encoder does. */
    private fun flipped(qr: QrCode, n: Int): ByteArray {
        val m = qr.modules.copyOf()
        val grid = Grid(qr.version)
        val s = qr.size
        val b = blocksFor(qr.version, qr.ecc)
        val limit = n * (b[1] + b[3])
        var bit = 0
        var upward = true
        var right = s - 1
        while (right >= 1) {
            if (right == 6) right = 5
            for (step in 0 until s) {
                val y = if (upward) s - 1 - step else step
                for (i in 0 until 2) {
                    val x = right - i
                    if (grid.isReserved(x, y)) continue
                    if (bit % 8 == 0 && bit / 8 < limit) m[y * s + x] = (m[y * s + x].toInt() xor 1).toByte()
                    bit++
                }
            }
            upward = !upward
            right -= 2
        }
        return m
    }

    private class Capacity(val version: Int, val ecc: ErrorCorrection, val check: Int, val p: Int, val fixable: Int)

    // Table 9: the check codewords of a block, its p, and the errors it corrects.
    // Reed-Solomon alone would correct 3, 5 and 5 at 1-L, 1-M and 2-L.
    private val capacity = listOf(
        Capacity(1, ErrorCorrection.L, 7, 3, 2), Capacity(1, ErrorCorrection.M, 10, 2, 4),
        Capacity(1, ErrorCorrection.Q, 13, 1, 6), Capacity(1, ErrorCorrection.H, 17, 1, 8),
        Capacity(2, ErrorCorrection.L, 10, 2, 4), Capacity(2, ErrorCorrection.M, 16, 0, 8),
        Capacity(3, ErrorCorrection.L, 15, 1, 7), Capacity(3, ErrorCorrection.M, 26, 0, 13),
        Capacity(5, ErrorCorrection.Q, 18, 0, 9), Capacity(12, ErrorCorrection.H, 28, 0, 14),
        Capacity(40, ErrorCorrection.M, 28, 0, 14),
    )

    @Test
    fun correctsWhatTable9AllowsInEveryBlockAndNoMore() {
        for (c in capacity) {
            val name = "${c.version}${c.ecc}"
            val text = "x".repeat(maxOf(1, c.version * 4))
            val qr = encode(text, EncodeOptions(version = c.version, ecc = c.ecc))
            val b = blocksFor(c.version, c.ecc)
            assertEquals("$name check codewords", c.check, b[0])
            assertEquals("$name table", c.fixable, (c.check - c.p) / 2)
            assertEquals("$name capacity", c.fixable, correctable(c.version, c.ecc))
            val got = readSymbol(reader(flipped(qr, c.fixable), qr.size), qr.size)
            assertNotNull(name, got)
            assertEquals(name, text, got!!.text)
            assertEquals(name, c.fixable * (b[1] + b[3]), got.corrected)
            assertNull("$name over", readSymbol(reader(flipped(qr, c.fixable + 1), qr.size), qr.size))
        }
    }

    @Test
    fun withholdsCheckCodewordsOnlyWhereTable9Does() {
        for (version in 1..40) {
            for (ecc in ErrorCorrection.values()) {
                val p = capacity.firstOrNull { it.version == version && it.ecc == ecc }?.p ?: 0
                assertEquals("$version$ecc", (blocksFor(version, ecc)[0] - p) / 2, correctable(version, ecc))
            }
        }
    }

    @Test
    fun survivesUpToThreeBadBitsInEachFormatCopy() {
        val qr = encode("HELLO", EncodeOptions(ecc = ErrorCorrection.H, mask = 5))
        val m = qr.modules.copyOf()
        for ((x, y) in listOf(8 to 0, 8 to 1, 8 to 2)) m[y * qr.size + x] = (m[y * qr.size + x].toInt() xor 1).toByte()
        val got = readSymbol(reader(m, qr.size), qr.size)!!
        assertEquals("HELLO", got.text)
        assertEquals(ErrorCorrection.H, got.ecc)
        assertEquals(5, got.mask)
    }

    @Test
    fun rejectsSizesThatAreNotASymbol() {
        assertNull(readSymbol({ _, _ -> false }, 22))
        assertNull(readSymbol({ _, _ -> false }, 21))
    }
}
