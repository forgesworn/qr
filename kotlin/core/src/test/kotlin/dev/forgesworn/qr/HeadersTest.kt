package dev.forgesworn.qr

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class HeadersTest {
    private val gs = "\u001d"

    // Version 2, level L: count lengths of the first band.
    private fun read(bits: List<Int>): DecodeResult? {
        val s = symbol(bits, 2, ErrorCorrection.L, 1)
        return decodeModules(s.modules, s.size)
    }

    private fun bytes(text: String) = text.toByteArray(Charsets.UTF_8)

    @Test
    fun buildsWhatEncodeBuilds() {
        val qr = encode("hello world", EncodeOptions(version = 2, ecc = ErrorCorrection.L, mask = 3))
        assertArrayEquals(qr.modules, symbol(Seg.bytes(bytes("hello world"), 8), 2, ErrorCorrection.L, 3).modules)
    }

    @Test
    fun leavesTheOptionalFieldsNullForAnOrdinarySymbol() {
        val got = read(Seg.bytes(bytes("plain"), 8))!!
        assertNull(got.structuredAppend)
        assertNull(got.fnc1)
    }

    @Test
    fun reportsAStructuredAppendHeaderAndKeepsThisSymbolsPartOnly() {
        val got = read(Seg.structuredAppend(1, 3, 0x5a) + Seg.bytes(bytes("second part"), 8))!!
        assertEquals(StructuredAppend(1, 3, 0x5a), got.structuredAppend)
        assertEquals("second part", got.text)
        assertNull(got.fnc1)
        val last = read(Seg.structuredAppend(15, 16, 0xff) + Seg.bytes(bytes("x"), 8))!!
        assertEquals(StructuredAppend(15, 16, 0xff), last.structuredAppend)
    }

    @Test
    fun readsFnc1FirstPositionPercentIsTheGroupSeparatorAndDoublePercentIsPercent() {
        val got = read(
            Seg.fncFirst() + Seg.numeric("0109506000134352", 10) + Seg.alnum("10ABC123%21XYZ", 9) + Seg.alnum("A%%B%", 9),
        )!!
        assertEquals(Fnc1(Fnc1Position.FIRST), got.fnc1)
        assertNull(got.structuredAppend)
        assertEquals("010950600013435210ABC123${gs}21XYZA%B$gs", got.text)
        assertArrayEquals(bytes(got.text), got.bytes)
    }

    @Test
    fun appliesThePercentRuleWithinASegmentToAlphanumericSegmentsOnlyAndOnlyAfterFnc1() {
        assertEquals("A%BC${gs}D", read(Seg.alnum("A%B", 9) + Seg.fncFirst() + Seg.alnum("C%D", 9))!!.text)
        assertEquals("A$gs${gs}B", read(Seg.fncFirst() + Seg.alnum("A%", 9) + Seg.alnum("%B", 9))!!.text)
        assertEquals("a%b%%", read(Seg.fncFirst() + Seg.bytes(bytes("a%b%%"), 8))!!.text)
        val plain = read(Seg.alnum("A%%B", 9))!!
        assertEquals("A%%B", plain.text)
        assertNull(plain.fnc1)
    }

    @Test
    fun readsFnc1SecondPositionWithItsApplicationIndicator() {
        val two = read(Seg.fncSecond(37) + Seg.alnum("AA1234%BBB", 9))!!
        assertEquals(Fnc1(Fnc1Position.SECOND, "37"), two.fnc1)
        assertEquals("AA1234${gs}BBB", two.text)
        fun a(v: Int) = read(Seg.fncSecond(v) + Seg.bytes(intArrayOf(0x41), 8))
        assertEquals("05", a(5)!!.fnc1!!.applicationIndicator)
        assertEquals("99", a(99)!!.fnc1!!.applicationIndicator)
        assertEquals("A", a(165)!!.fnc1!!.applicationIndicator)
        assertEquals("z", a(222)!!.fnc1!!.applicationIndicator)
        for (bad in listOf(100, 164, 191, 196, 223, 255)) assertNull("$bad", a(bad))
    }

    @Test
    fun readsBothHeadersTogether() {
        val got = read(Seg.structuredAppend(0, 2, 7) + Seg.fncFirst() + Seg.alnum("1A%2B", 9))!!
        assertEquals(StructuredAppend(0, 2, 7), got.structuredAppend)
        assertEquals(Fnc1(Fnc1Position.FIRST), got.fnc1)
        assertEquals("1A${gs}2B", got.text)
    }

    @Test
    fun agreesWithTheReferenceDecoderOnFnc1FirstPositionText() {
        // Second position is left out: the reference decoder does not consume its application indicator.
        for (bits in listOf(
            Seg.fncFirst() + Seg.numeric("0109506000134352", 10) + Seg.alnum("10ABC123%21XYZ", 9) + Seg.alnum("A%%B%", 9),
            Seg.fncFirst() + Seg.alnum("A%", 9) + Seg.alnum("%B%%", 9) + Seg.bytes(bytes("a%%"), 8),
        )) {
            val s = symbol(bits, 2, ErrorCorrection.L, 1)
            val g = picture(s.modules, s.size, 4)
            val reference = zxingRead(g)
            assertNotNull(reference)
            assertEquals(reference, decodeModules(s.modules, s.size)!!.text)
        }
    }
}
