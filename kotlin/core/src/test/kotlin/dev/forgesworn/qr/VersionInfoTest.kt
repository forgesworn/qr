package dev.forgesworn.qr

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VersionInfoTest {
    /** Module indices of the 18 bits of the bottom-left and top-right version blocks; index k is value bit k. */
    private fun versionModules(size: Int): Pair<IntArray, IntArray> {
        val bottomLeft = IntArray(18) { k -> (size - 11 + k % 3) * size + k / 3 }
        val topRight = IntArray(18) { k -> (k / 3) * size + (size - 11 + k % 3) }
        return bottomLeft to topRight
    }

    private fun flip(m: ByteArray, i: Int) {
        m[i] = (m[i].toInt() xor 1).toByte()
    }

    @Test
    fun versionHintRequiresBothCopiesToAgreeIndependently() {
        for (version in listOf(7, 12, 40)) {
            val size = 17 + 4 * version
            val (bottom, top) = versionModules(size)
            val modules = ByteArray(size * size)
            fun write(indices: IntArray, word: Int) {
                for (k in indices.indices) modules[indices[k]] = ((word shr k) and 1).toByte()
            }
            fun reader(mirrored: Boolean) = ModuleReader { x, y ->
                modules[if (mirrored) x * size + y else y * size + x].toInt() == 1
            }
            write(bottom, versionBits(version))
            write(top, versionBits(version))
            for (k in 0..2) { flip(modules, bottom[k]); flip(modules, top[k + 5]) }
            assertEquals(version, agreedVersion(reader(false), size))
            assertEquals(version, agreedVersion(reader(true), size))
            flip(modules, bottom[3])
            assertNull(agreedVersion(reader(false), size))
            write(bottom, versionBits(version))
            write(top, versionBits(if (version == 40) 39 else version + 1))
            assertNull(agreedVersion(reader(false), size))
            assertNull(agreedVersion(reader(true), size))
        }
        assertNull(agreedVersion(ModuleReader { _, _ -> error("must not sample") }, 41))
    }

    @Test
    fun readsWhenFourBitsOfEachCopyAreFlipped() {
        for (version in listOf(7, 10, 40)) {
            val text = "v$version-" + "HELLO 0123 ".repeat(version)
            val qr = encode(text, EncodeOptions(ecc = ErrorCorrection.L, version = version))
            val (bottomLeft, topRight) = versionModules(qr.size)
            val m = qr.modules.copyOf()
            // Four flips are at least four bits from every version code, so neither copy decodes.
            for (k in listOf(0, 5, 11, 17)) {
                flip(m, bottomLeft[k])
                flip(m, topRight[(k + 3) % 18])
            }
            val got = decodeModules(m, qr.size)
            assertNotNull("v$version", got)
            assertEquals(text, got!!.text)
            assertEquals(version, got.version)
            assertEquals(false, got.mirrored)
        }
    }

    @Test
    fun readsWhenBothCopiesAreBlanked() {
        for (version in listOf(7, 10, 40)) {
            val qr = encode("blank $version", EncodeOptions(version = version))
            val (bottomLeft, topRight) = versionModules(qr.size)
            for (level in 0..1) {
                val m = qr.modules.copyOf()
                for (i in bottomLeft + topRight) m[i] = level.toByte()
                val got = decodeModules(m, qr.size)
                assertNotNull("v$version level $level", got)
                assertEquals("blank $version", got!!.text)
            }
        }
    }

    @Test
    fun stillReadsAMirroredSymbolWithBothCopiesDamaged() {
        val qr = encode("mirror", EncodeOptions(version = 10))
        val s = qr.size
        val m = ByteArray(s * s)
        for (y in 0 until s) for (x in 0 until s) m[x * s + y] = qr.modules[y * s + x]
        val (bottomLeft, topRight) = versionModules(s)
        for (i in bottomLeft + topRight) m[i] = 0
        val got = decodeModules(m, s)
        assertNotNull(got)
        assertEquals("mirror", got!!.text)
        assertEquals(true, got.mirrored)
    }

    @Test
    fun aCopyNamingAnotherVersionStillFails() {
        val qr = encode("same grid", EncodeOptions(ecc = ErrorCorrection.L, version = 11))
        val (bottomLeft, topRight) = versionModules(qr.size)
        val m = qr.modules.copyOf()
        // Both copies say version 10 on a grid whose size says 11.
        val bits = versionBits(10)
        for (k in 0 until 18) {
            m[bottomLeft[k]] = ((bits shr k) and 1).toByte()
            m[topRight[k]] = ((bits shr k) and 1).toByte()
        }
        assertNull(decodeModules(m, qr.size))
    }

    @Test
    fun wrongSizesAndHeavyDamageNeverGiveWrongText() {
        val rand = Random(20260101)
        var read = 0
        var refused = 0
        for (n in 0 until 300) {
            val version = 7 + rand.nextInt(34)
            val text = ("sample ${n.toString(36)} " + "ABCDE-12345 ".repeat(version * 3)).take(20 + version * 4)
            val bytes = text.toByteArray(Charsets.UTF_8)
            val ecc = if (n % 2 == 0) ErrorCorrection.L else ErrorCorrection.M
            val qr = encode(bytes, EncodeOptions(ecc = ecc, version = version))
            val size = qr.size
            val at = { x: Int, y: Int -> x in 0 until size && y in 0 until size && qr.modules[y * size + x].toInt() == 1 }
            val checks = ArrayList<Pair<Int, ModuleReader>>()
            for (d in listOf(-8, -4, 4, 8)) {
                val wrong = size + d
                if (wrong < 21 || wrong > 177) continue
                // Stretched to fit, as a mislocated sampling grid would.
                checks.add(wrong to ModuleReader { x, y -> at(x * size / wrong, y * size / wrong) })
                // The same module pitch in a larger or smaller frame, corner fixed.
                checks.add(wrong to ModuleReader { x, y -> at(x, y) })
            }
            // Damage at the right size: a light touch that is correctable, then 5 per cent to half the symbol.
            for (rate in listOf(0.003, 0.05, 0.1, 0.2, 0.35, 0.5)) {
                val flips = BooleanArray(size * size) { rand.nextDouble() < rate }
                checks.add(size to ModuleReader { x, y -> (qr.modules[y * size + x].toInt() == 1) != flips[y * size + x] })
            }
            for ((s, reader) in checks) {
                val got = readSymbol(reader, s)
                if (got == null) {
                    refused++
                } else {
                    read++
                    assertTrue("v$version read at $s", bytes.contentEquals(got.bytes))
                }
            }
        }
        assertTrue("refused $refused", refused > 1000)
        assertTrue("read $read", read > 0)
    }
}
