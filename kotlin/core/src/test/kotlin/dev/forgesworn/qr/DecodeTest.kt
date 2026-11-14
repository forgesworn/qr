package dev.forgesworn.qr

import java.util.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class DecodeTest {
    private val payload = "https://example.com/r/7f3a9c2e41b8?k=Z2l2ZSBtZSBhIHJvb20"

    @Test
    fun readsEveryZxingVectorFromACleanStraightPicture() {
        for (v in encodeVectors()) {
            val g = picture(fromRows(v.rows, v.size), v.size, if (v.size > 100) 2 else 3)
            val got = decode(g.data, g.width, g.height, inversion = Inversion.NORMAL)
            assertNotNull(v.id, got)
            assertEquals(v.id, v.text, got!!.text)
            assertEquals(v.id, v.version, got.version)
            assertEquals(v.id, v.ecc, got.ecc)
            assertEquals(v.id, v.mask, got.mask)
            assertFalse(v.id, got.mirrored)
            assertFalse(v.id, got.inverted)
        }
    }

    @Test
    fun readsInvertedAndMirroredCodesAndSaysSo() {
        val qr = encode(payload)
        val inv = picture(qr.modules, qr.size, 4, invert = true)
        val a = decode(inv.data, inv.width, inv.height)!!
        assertEquals(payload, a.text)
        assertTrue(a.inverted)
        assertFalse(a.mirrored)
        val mir = picture(transpose(qr.modules, qr.size), qr.size, 4)
        val b = decode(mir.data, mir.width, mir.height)!!
        assertEquals(payload, b.text)
        assertFalse(b.inverted)
        assertTrue(b.mirrored)
        assertNull(decode(inv.data, inv.width, inv.height, inversion = Inversion.NORMAL))
        assertEquals(payload, decode(inv.data, inv.width, inv.height, inversion = Inversion.INVERTED)!!.text)
    }

    @Test
    fun returnsTextBytesAndEci() {
        val qr = encode("café ☃", EncodeOptions(eci = true))
        val g = picture(qr.modules, qr.size, 4)
        val got = decode(g.data, g.width, g.height)!!
        assertEquals("café ☃", got.text)
        assertEquals(listOf(26), got.eci)
        assertEquals("café ☃", String(got.bytes, Charsets.UTF_8))
    }

    @Test
    fun takesArgbPaddedRowsAndTransparentBackgrounds() {
        val qr = encode(payload)
        val g = picture(qr.modules, qr.size, 3)
        val argb = IntArray(g.data.size) { val y = g.data[it].toInt() and 0xFF; (0xFF shl 24) or (y shl 16) or (y shl 8) or y }
        assertEquals(payload, decode(argb, g.width, g.height)!!.text)

        val stride = g.width + 13
        val padded = ByteArray(stride * g.height) { 7 }
        for (y in 0 until g.height) System.arraycopy(g.data, y * g.width, padded, y * stride, g.width)
        assertEquals(payload, decode(padded, g.width, g.height, rowStride = stride)!!.text)

        // Dark modules drawn on a transparent canvas: alpha 0, colour black, everywhere else.
        val clear = IntArray(g.data.size) { if ((g.data[it].toInt() and 0xFF) > 128) 0x00000000 else 0xFF000000.toInt() }
        assertEquals(payload, decode(clear, g.width, g.height)!!.text)
    }

    @Test
    fun reportsWhereTheCodeIs() {
        val qr = encode(payload)
        val g = picture(qr.modules, qr.size, 4)
        val loc = decode(g.data, g.width, g.height)!!.location!!
        assertTrue(loc.topRight.x > loc.topLeft.x)
        assertTrue(loc.bottomLeft.y > loc.topLeft.y)
        assertTrue(Math.abs(loc.topRight.x - loc.topLeft.x - (qr.size - 7) * 4) < 2)
    }

    @Test
    fun findsNothingInNoiseOrABlankPicture() {
        val random = Random(9)
        val noise = ByteArray(200 * 200) { if (random.nextDouble() < 0.5) 0 else 255.toByte() }
        assertNull(decode(noise, 200, 200))
        assertNull(decode(ByteArray(100 * 100) { 255.toByte() }, 100, 100))
        assertNull(decode(ByteArray(100 * 100), 100, 100))
    }

    @Test
    fun rejectsBadInput() {
        for (bad in listOf<() -> Unit>(
            { decode(ByteArray(10), 100, 100) },
            { decode(ByteArray(100), 0, 100) },
            { decode(ByteArray(100), 10, 10, rowStride = 5) },
            { decode(IntArray(10), 100, 100) },
        )) {
            try {
                bad()
                fail("expected IllegalArgumentException")
            } catch (_: IllegalArgumentException) {
            }
        }
    }

    @Test
    fun decodeModulesReadsAGridStraightAndMirrored() {
        val qr = encode(payload)
        val straight = decodeModules(qr.modules, qr.size)!!
        assertEquals(payload, straight.text)
        assertFalse(straight.mirrored)
        assertFalse(straight.inverted)
        assertNull(straight.location)
        val mirrored = decodeModules(transpose(qr.modules, qr.size), qr.size)!!
        assertEquals(payload, mirrored.text)
        assertTrue(mirrored.mirrored)
        assertNull(decodeModules(ByteArray(qr.size * qr.size), qr.size))
        val booleans = BooleanArray(qr.size * qr.size) { qr.modules[it].toInt() == 1 }
        assertEquals(payload, decodeModules(booleans, qr.size)!!.text)
    }
}
