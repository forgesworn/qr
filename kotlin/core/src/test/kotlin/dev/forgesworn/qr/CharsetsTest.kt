package dev.forgesworn.qr

import java.io.File
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CharsetsTest {
    // Version 2, level L: count lengths of the first band.
    private fun read(bits: List<Int>): DecodeResult? {
        val s = symbol(bits, 2, ErrorCorrection.L, 1)
        return decodeModules(s.modules, s.size)
    }

    private fun b(vararg v: Int) = IntArray(v.size) { v[it] }

    private fun fixture(): Map<String, Any?> = readJsonObject(File(vectorsDir().parentFile, "test/charsets.json"))

    private fun sjisOf(v: Int): Int {
        val s = ((v / 0xc0) shl 8) or (v % 0xc0)
        return s + if (s < 0x1f00) 0x8140 else 0xc140
    }

    @Test
    fun everyKanjiValueAgreesWithTheFixture() {
        val expected = fixture()["kanji"] as String
        val got = StringBuilder()
        for (v in 0 until 8192) got.append(kanjiText(sjisOf(v)))
        assertEquals(expected, got.toString())
    }

    private fun gbOf(v: Int): IntArray {
        val row = v / 0x60
        return intArrayOf(row + if (row < 0x0a) 0xa1 else 0xa6, v % 0x60 + 0xa1)
    }

    @Test
    fun everyHanziValueAgreesWithTheFixture() {
        val expected = fixture()["hanzi"] as String
        val got = StringBuilder()
        for (v in 0 until 8192) {
            val (lead, low) = gbOf(v)
            got.append(hanziText(lead, low) ?: "\u0000")
        }
        assertEquals(expected, got.toString())
    }

    @Test
    fun decodesHanziAsGb2312AndKeepsBytesAsGb2312() {
        val got = read(Seg.hanzi(listOf(0x122f, 0x0f23), 8))!!
        assertEquals("中文", got.text)
        assertArrayEquals(byteArrayOf(0xd6.toByte(), 0xd0.toByte(), 0xce.toByte(), 0xc4.toByte()), got.bytes)
        assertEquals("A中B", read(Seg.bytes(b(0x41), 8) + Seg.hanzi(listOf(0x122f), 8) + Seg.bytes(b(0x42), 8))!!.text)
    }

    @Test
    fun rejectsAnotherSubsetAValueOutsideGb2312OrAnEmptyCell() {
        assertNull(read(Seg.hanzi(listOf(0x122f), 8, 2)))
        // Low byte past FE, a lead byte in AA-AF, a lead past F7, and D7FA, which GB2312 leaves empty; A6D9 and A8BC, which table editions read differently.
        for (v in listOf(0x30 * 0x60 + 0x5e, 9 * 0x60, 0x52 * 0x60, 0x31 * 0x60 + 0x59, 5 * 0x60 + 0x38, 7 * 0x60 + 0x1b)) assertNull(read(Seg.hanzi(listOf(0x122f, v), 8)))
    }

    // ISO 8859-10 and -14 are absent from the JDK; those ECIs fall back.
    private val absentOnJvm = setOf("12", "16")

    @Test
    fun singleByteSetsAgreeWithTheFixtureWhereTheJvmHasThem() {
        @Suppress("UNCHECKED_CAST")
        val single = fixture()["single"] as Map<String, String>
        for ((eci, expected) in single) {
            val got = fromEci(eci.toInt(), IntArray(256) { it })
            if (eci in absentOnJvm && got == null) continue
            assertEquals("ECI $eci", expected, got)
        }
    }

    @Test
    fun anAbsentCharsetFallsBackToLatin1() {
        for (eci in absentOnJvm) {
            if (fromEci(eci.toInt(), b(0xe9)) != null) continue
            assertEquals("\u00e9", read(Seg.eci(eci.toInt()) + Seg.bytes(b(0xe9), 8))!!.text)
        }
    }

    @Test
    fun multiByteAndUtf16SamplesAgreeWithTheFixture() {
        @Suppress("UNCHECKED_CAST")
        val samples = fixture()["samples"] as Map<String, List<List<String>>>
        for ((eci, rows) in samples) {
            for ((hex, expected) in rows) {
                val bytes = IntArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16) }
                assertEquals("ECI $eci $hex", expected, fromEci(eci.toInt(), bytes))
            }
        }
    }

    @Test
    fun decodesTheStandardExampleAndKeepsBytesAsShiftJis() {
        val got = read(Seg.kanji(listOf(0x0d9f, 0x1aaa), 8))!!
        assertEquals("点茗", got.text)
        assertArrayEquals(byteArrayOf(0x93.toByte(), 0x5f, 0xe4.toByte(), 0xaa.toByte()), got.bytes)
    }

    @Test
    fun keepsTheEciInForceAfterAKanjiCharacter() {
        val got = read(Seg.eci(26) + Seg.bytes(b(0xc3, 0xa9), 8) + Seg.kanji(listOf(0x0d9f), 8) + Seg.bytes(b(0xc3, 0xa9), 8))!!
        assertEquals("é点é", got.text)
    }

    @Test
    fun readsGreekAndShiftJisEcis() {
        assertEquals("ΑΒΓ", read(Seg.eci(9) + Seg.bytes(b(0xc1, 0xc2, 0xc3), 8))!!.text)
        assertEquals("点", read(Seg.eci(20) + Seg.bytes(b(0x93, 0x5f), 8))!!.text)
    }

    @Test
    fun readsBig5GbAndEucKr() {
        assertEquals("中文", read(Seg.eci(28) + Seg.bytes(b(0xa4, 0xa4, 0xa4, 0xe5), 8))!!.text)
        assertEquals("中文", read(Seg.eci(29) + Seg.bytes(b(0xd6, 0xd0, 0xce, 0xc4), 8))!!.text)
        assertEquals("한국", read(Seg.eci(30) + Seg.bytes(b(0xc7, 0xd1, 0xb1, 0xb9), 8))!!.text)
    }

    @Test
    fun treatsUndefinedWindowsBytesAndHighAsciiBytesAsReplacement() {
        assertEquals("A�", read(Seg.eci(23) + Seg.bytes(b(0x41, 0x81), 8))!!.text)
        assertEquals("A�", read(Seg.eci(27) + Seg.bytes(b(0x41, 0xe9), 8))!!.text)
    }

    @Test
    fun leavesEci3AsLatin1AndUnassignedEcisToTheFallback() {
        assertEquals("é", read(Seg.eci(3) + Seg.bytes(b(0xe9), 8))!!.text)
        assertEquals("é", read(Seg.eci(14) + Seg.bytes(b(0xe9), 8))!!.text)
        assertEquals("hi", read(Seg.eci(900) + Seg.bytes(b(0x68, 0x69), 8))!!.text)
    }

    @Test
    fun neverChangesBytes() {
        val got = read(Seg.eci(9) + Seg.bytes(b(0xc1, 0xc2), 8))!!
        assertArrayEquals(byteArrayOf(0xc1.toByte(), 0xc2.toByte()), got.bytes)
    }
}
