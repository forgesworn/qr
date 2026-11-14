package dev.forgesworn.qr

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
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

    @Test
    fun correctsUpToHalfTheCheckCodewordsInEveryBlockAndNoMore() {
        for ((version, ecc) in listOf(1 to ErrorCorrection.L, 5 to ErrorCorrection.Q, 12 to ErrorCorrection.H, 40 to ErrorCorrection.M)) {
            val text = "x".repeat(maxOf(1, version * 4))
            val qr = encode(text, EncodeOptions(version = version, ecc = ecc))
            val b = blocksFor(version, ecc)
            val fixable = b[0] / 2
            val got = readSymbol(reader(flipped(qr, fixable), qr.size), qr.size)
            assertNotNull("$version$ecc", got)
            assertEquals("$version$ecc", text, got!!.text)
            assertEquals("$version$ecc", fixable * (b[1] + b[3]), got.corrected)
            val over = readSymbol(reader(flipped(qr, fixable + 1), qr.size), qr.size)
            assertNotEquals("$version$ecc over", text, over?.text)
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
