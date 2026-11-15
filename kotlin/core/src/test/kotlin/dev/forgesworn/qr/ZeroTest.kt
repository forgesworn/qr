package dev.forgesworn.qr

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** The cases of test/zero.test.ts. */
class ZeroTest {
    private class Case(val version: Int, val ecc: ErrorCorrection)

    // One block; two sizes of block; version information and five blocks.
    private val cases = listOf(
        Case(1, ErrorCorrection.L), Case(1, ErrorCorrection.M), Case(1, ErrorCorrection.Q), Case(1, ErrorCorrection.H),
        Case(2, ErrorCorrection.L), Case(5, ErrorCorrection.Q), Case(7, ErrorCorrection.H),
    )

    private fun reader(m: ByteArray, size: Int) = ModuleReader { x, y -> m[y * size + x].toInt() == 1 }

    /**
     * A symbol whose every codeword is zero. Its data region shows the mask
     * pattern itself, as a checkerboard, stripes or a screen's moire can; all
     * zeros pass Reed-Solomon, and the first four bits read as a terminator.
     */
    private fun zero(version: Int, ecc: ErrorCorrection, mask: Int): Built {
        val b = blocksFor(version, ecc)
        val grid = Grid(version)
        grid.placeData(IntArray(b[1] * b[2] + b[3] * (b[2] + 1) + b[0] * (b[1] + b[3])))
        return Built(grid.render(ecc, mask), grid.size)
    }

    /** Flips the first bit of the first [n] codewords of every block, walking the zigzag as the encoder does. */
    private fun flipped(modules: ByteArray, version: Int, ecc: ErrorCorrection, n: Int): ByteArray {
        val m = modules.copyOf()
        val grid = Grid(version)
        val s = grid.size
        val b = blocksFor(version, ecc)
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

    private fun drawn(modules: ByteArray, size: Int, invert: Boolean): DecodeResult? {
        val p = picture(modules, size, 6, invert = invert)
        return decode(p.data, p.width, p.height)
    }

    @Test
    fun isBuiltAsMeant() {
        for (mask in 0 until 8) {
            val z = zero(1, ErrorCorrection.H, mask)
            val qr = encode("", EncodeOptions(version = 1, ecc = ErrorCorrection.H, mask = mask))
            val grid = Grid(1)
            for (y in 0 until z.size) for (x in 0 until z.size) {
                if (grid.isReserved(x, y)) assertEquals("$mask $x,$y", qr.modules[y * z.size + x], z.modules[y * z.size + x])
            }
        }
    }

    @Test
    fun readsAsNothingUnderEveryMaskUndamagedAndDamagedUpToWhatEachBlockCanCorrect() {
        for (c in cases) {
            val fixable = blocksFor(c.version, c.ecc)[0] / 2
            for (mask in 0 until 8) {
                val z = zero(c.version, c.ecc, mask)
                for (n in 0..fixable) {
                    val m = flipped(z.modules, c.version, c.ecc, n)
                    assertNull("${c.version}${c.ecc} mask $mask flipped $n", readSymbol(reader(m, z.size), z.size))
                }
            }
        }
    }

    @Test
    fun readsAsNothingAsModulesStraightAndMirrored() {
        for (c in cases) {
            val fixable = blocksFor(c.version, c.ecc)[0] / 2
            for (mask in 0 until 8) {
                val z = zero(c.version, c.ecc, mask)
                for (n in listOf(0, fixable)) {
                    val m = flipped(z.modules, c.version, c.ecc, n)
                    assertNull("${c.version}${c.ecc} mask $mask flipped $n", decodeModules(m, z.size))
                    assertNull("${c.version}${c.ecc} mask $mask flipped $n mirrored", decodeModules(transpose(m, z.size), z.size))
                }
            }
        }
    }

    // Each of these is a whole search that finds nothing, so fewer cases than above.
    @Test
    fun readsAsNothingInAPictureInBothPolaritiesStraightAndMirrored() {
        var turn = 0
        for (c in listOf(Case(1, ErrorCorrection.H), Case(2, ErrorCorrection.L), Case(5, ErrorCorrection.Q))) {
            val fixable = blocksFor(c.version, c.ecc)[0] / 2
            for (mask in 0 until 8) {
                val z = zero(c.version, c.ecc, mask)
                for (invert in listOf(false, true)) {
                    for (mirror in listOf(false, true)) {
                        val grid = if (mirror) transpose(z.modules, z.size) else z.modules
                        assertNull("${c.version}${c.ecc} mask $mask inverted $invert mirrored $mirror", drawn(grid, z.size, invert))
                    }
                }
                val m = flipped(z.modules, c.version, c.ecc, fixable)
                val invert = turn and 1 == 1
                val mirror = turn and 2 == 2
                turn++
                assertNull(
                    "${c.version}${c.ecc} mask $mask flipped $fixable inverted $invert mirrored $mirror",
                    drawn(if (mirror) transpose(m, z.size) else m, z.size, invert),
                )
            }
        }
    }

    @Test
    fun leavesThePictureReadable() {
        for (c in cases) {
            val qr = encode("0", EncodeOptions(version = c.version, ecc = c.ecc, mask = 0))
            assertEquals("${c.version}${c.ecc}", "0", drawn(qr.modules, qr.size, false)?.text)
            assertEquals("${c.version}${c.ecc} mirrored, inverted", "0", drawn(transpose(qr.modules, qr.size), qr.size, true)?.text)
        }
    }

    @Test
    fun readsAnEmptyStringAndAnEmptyByteArrayBackAsEmpty() {
        for (c in cases) {
            val options = EncodeOptions(version = c.version, ecc = c.ecc)
            for (qr in listOf(encode("", options), encode(ByteArray(0), options))) {
                val got = readSymbol(reader(qr.modules, qr.size), qr.size)
                assertNotNull("${c.version}${c.ecc}", got)
                assertEquals("", got!!.text)
                assertEquals(0, got.bytes.size)
                assertEquals(c.version, got.version)
                assertEquals(c.ecc, got.ecc)
                assertEquals(0, got.corrected)
                assertEquals("${c.version}${c.ecc} drawn", "", drawn(qr.modules, qr.size, false)?.text)
            }
        }
    }

    @Test
    fun readsZeroBytesBackWhereTheyLeaveWholeBlocksZero() {
        for ((c, length) in listOf(Case(1, ErrorCorrection.L) to 17, Case(5, ErrorCorrection.Q) to 60, Case(7, ErrorCorrection.H) to 64)) {
            val bytes = ByteArray(length)
            val qr = encode(bytes, EncodeOptions(version = c.version, ecc = c.ecc))
            assertArrayEquals("${c.version}${c.ecc}", bytes, readSymbol(reader(qr.modules, qr.size), qr.size)?.bytes)
            assertArrayEquals("${c.version}${c.ecc} drawn", bytes, drawn(qr.modules, qr.size, false)?.bytes)
        }
    }
}
