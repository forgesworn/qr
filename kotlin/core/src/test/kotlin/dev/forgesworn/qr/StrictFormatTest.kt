package dev.forgesworn.qr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StrictFormatTest {
    @Test
    fun lazyAgreementMatchesBothOrientationsOfTheFormatGate() {
        var rejected = 0
        for (version in listOf(1, 7, 12)) {
            val qr = encode("hello", EncodeOptions(version = version))
            val size = qr.size
            val allowed = mutableSetOf<Pair<Int, Int>>()
            for (i in 0 until 15) {
                val x = if (i < 8) size - 1 - i else 8
                val y = if (i < 8) 8 else size - 7 + (i - 8)
                for ((a, b) in listOf(FORMAT_COORDS[i][0] to FORMAT_COORDS[i][1], x to y)) {
                    allowed.add(a to b)
                    allowed.add(b to a)
                }
            }
            for (mirrored in listOf(false, true)) for (damage in 0..3) {
                val modules = qr.modules.copyOf()
                for (i in 0 until damage) {
                    val p = FORMAT_COORDS[i]
                    val at = p[1] * size + p[0]
                    modules[at] = (modules[at].toInt() xor 1).toByte()
                }
                val input = if (mirrored) ByteArray(modules.size) { i -> modules[(i % size) * size + i / size] } else modules
                var reads = 0
                val lazy = ModuleReader { x, y ->
                    assertTrue((x to y) in allowed)
                    reads++
                    input[y * size + x].toInt() == 1
                }
                val actual = agreementRead(lazy, size)
                assertEquals(60, reads)
                val readers = listOf(
                    ModuleReader { x, y -> input[y * size + x].toInt() == 1 },
                    ModuleReader { x, y -> input[x * size + y].toInt() == 1 },
                )
                val any = readers.any { reader -> EC_ORDER.any { ecc -> (0..7).any { mask -> formatAgrees(reader, size, ecc, mask) } } }
                assertEquals(any, actual != null)
                if (actual != null) assertTrue(formatAgrees(readers[if (actual.mirrored) 1 else 0], size, actual.ecc, actual.mask))
                if (damage <= 2) assertNotNull(actual) else if (actual == null) rejected++
                // The ordinary grid reader may still use the intact copy.
                assertEquals("hello", decodeModules(input, size)?.text)
            }
        }
        assertTrue(rejected > 0)
    }
}
