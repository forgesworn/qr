package dev.forgesworn.qr

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SjisTest {
    // Version 2, level L: count lengths of the first band.
    private fun read(bits: List<Int>): DecodeResult {
        val s = symbol(bits, 2, ErrorCorrection.L, 1)
        return decodeModules(s.modules, s.size)!!
    }

    private fun ascii(s: String) = IntArray(s.length) { s[it].code }

    private fun text(vararg parts: IntArray): String = read(Seg.bytes(parts.flatMap { it.toList() }.toIntArray(), 8)).text

    private fun b(vararg v: Int) = IntArray(v.size) { v[it] }

    private fun yes(vararg v: Int) = looksShiftJis(b(*v))

    @Test
    fun readsHalfWidthKatakanaAsShiftJis() {
        assertEquals("ﾃﾞｻﾞｲﾝQR", text(b(0xc3, 0xde, 0xbb, 0xde, 0xb2, 0xdd), ascii("QR")))
    }

    @Test
    fun readsKanjiShortAndWithAsciiAround() {
        assertEquals("東京", text(b(0x93, 0x8c, 0x8b, 0x9e)))
        assertEquals("ID:日本1", text(ascii("ID:"), b(0x93, 0xfa, 0x96, 0x7b), ascii("1")))
        assertEquals("あ", text(b(0x82, 0xa0)))
    }

    @Test
    fun leavesOrdinaryLatin1Alone() {
        assertEquals("café", text(ascii("caf"), b(0xe9)))
        assertEquals("é", text(b(0xe9)))
        assertEquals("élève", text(b(0xe9, 0x6c, 0xe8, 0x76, 0x65)))
        assertEquals("Zürich", text(ascii("Z"), b(0xfc), ascii("rich")))
        assertEquals("naïve", text(ascii("na"), b(0xef), ascii("ve")))
        assertEquals("garçon", text(ascii("gar"), b(0xe7), ascii("on")))
        assertEquals("Año", text(ascii("A"), b(0xf1), ascii("o")))
        assertEquals("a la carteà", text(ascii("a la carte"), b(0xe0)))
    }

    @Test
    fun leavesCurrencySignsAndSingleSymbolsAlone() {
        assertEquals("¥100", text(b(0xa5), ascii("100")))
        assertEquals("£9.99", text(b(0xa3), ascii("9.99")))
        assertEquals("£5 ¥6", text(b(0xa3), ascii("5 "), b(0xa5), ascii("6")))
        assertEquals("Ça va", text(b(0xc7), ascii("a va")))
    }

    @Test
    fun prefersValidUtf8AndLeavesBytesAlone() {
        assertEquals("é", text(b(0xc3, 0xa9)))
        val got = read(Seg.bytes(b(0xc3, 0xde, 0xbb, 0xde, 0xb2, 0xdd), 8))
        assertArrayEquals(byteArrayOf(0xc3.toByte(), 0xde.toByte(), 0xbb.toByte(), 0xde.toByte(), 0xb2.toByte(), 0xdd.toByte()), got.bytes)
    }

    @Test
    fun isNotAppliedUnderAnEci() {
        val got = read(Seg.eci(3) + Seg.bytes(b(0x93, 0x8c, 0x8b, 0x9e), 8))
        assertEquals("\u0093\u008c\u008b\u009e", got.text)
    }

    @Test
    fun theRuleByteByByte() {
        assertTrue(yes(0xb1, 0xb2, 0xb3))
        assertFalse(yes(0xb1, 0xb2))
        assertTrue(yes(0xe0, 0x40, 0xe1, 0x41, 0xe2, 0x42))
        assertFalse(yes(0xe0, 0x40, 0xe1, 0x41))
        assertTrue(yes(0x81, 0x40))
        assertFalse(yes(0x81, 0x40, 0xe9))
        assertFalse(yes(0x81, 0x7f))
        assertFalse(yes(0x80))
        assertFalse(yes(0xa0, 0xb1, 0xb2, 0xb3))
        assertFalse(yes(0xb1, 0xb2, 0xb3, 0xf0))
        assertFalse(yes(0xb1, 0xb2, 0x41, 0xb3))
    }
}
