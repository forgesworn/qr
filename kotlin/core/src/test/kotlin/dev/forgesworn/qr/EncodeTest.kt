package dev.forgesworn.qr

import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class EncodeTest {
    /** The same generator as the TypeScript tests, so both ports see the same made-up payloads. */
    private fun prng(seed: Long): () -> Double {
        var s = seed and 0xffffffffL
        return {
            s = (s * 1664525L + 1013904223L) and 0xffffffffL
            s / 4294967296.0
        }
    }

    @Test
    fun isDarkIsFalseOutsideTheSymbol() {
        val qr = encode("HELLO WORLD", EncodeOptions(ecc = ErrorCorrection.Q))
        assertTrue(qr.isDark(0, 0))
        for ((x, y) in listOf(qr.size to 0, 0 to qr.size, -1 to 0, 0 to -1, Int.MIN_VALUE to 0, 0 to Int.MAX_VALUE)) {
            assertFalse("($x, $y)", qr.isDark(x, y))
            assertFalse("($x, $y)", isDark(qr, x, y))
        }
    }

    @Test
    fun rejectsAFixedVersionBelowMinVersion() {
        val e = assertThrows(IllegalArgumentException::class.java) { encode("A", EncodeOptions(version = 3, minVersion = 5)) }
        assertEquals("Version is below minVersion", e.message)
        assertFalse(e is QrCapacityError)
        assertEquals(5, encode("A", EncodeOptions(version = 5, minVersion = 5)).version)
        assertEquals(5, encode("A", EncodeOptions(minVersion = 5)).version)
    }

    @Test
    fun keepsANamedModeBytesAndEmptyTextAsOneSegment() {
        val text = "ORDER 0123456789 abc"
        assertEquals(listOf(Segment(Mode.BYTE, 20)), encode(text, EncodeOptions(mode = Mode.BYTE)).segments)
        assertEquals(listOf(Segment(Mode.ALPHANUMERIC, 16)), encode("ORDER 0123456789", EncodeOptions(mode = Mode.ALPHANUMERIC)).segments)
        assertEquals(listOf(Segment(Mode.BYTE, 3)), encode(byteArrayOf(0x30, 0x31, 0x32)).segments)
        assertEquals(listOf(Segment(Mode.BYTE, 0)), encode("").segments)
        assertTrue(encode(text).segments.size > 1)
    }

    @Test
    fun reportsTheWidestModeAndCountsUtf8Bytes() {
        assertEquals(Mode.ALPHANUMERIC, encode("ORDER/20261115000123").mode)
        assertEquals(Mode.BYTE, encode("order 20261115000123").mode)
        // 2 + 3 bytes, and a lone surrogate as U+FFFD, 3 more.
        assertEquals(listOf(Segment(Mode.BYTE, 8)), encode("é☕\ud800").segments)
    }

    @Test
    fun shrinksPaymentUrisWithALowercaseSchemeAndAnUppercaseBody() {
        val random = prng(2026)
        val bech32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
        fun pick(n: Int) = String(CharArray(n) { bech32[(random() * 32).toInt()] }).uppercase()
        val shapes = linkedMapOf(
            "bolt11" to "lightning:LNBC2500U1P${pick(330)}",
            "bip21" to "bitcoin:BC1Q${pick(38)}?amount=0.00025000&lightning=LNBC2500U1P${pick(330)}",
            "lnurl" to "lightning:LNURL1${pick(180)}",
            "gs1" to "https://id.example.com/01/09506000134352/10/ABC123/21/000000012345",
        )
        fun versions(text: String, mode: Mode?) = ErrorCorrection.values().map { encode(text, EncodeOptions(ecc = it, mode = mode)).version }
        val table = shapes.mapValues { (_, text) -> listOf(versions(text, Mode.BYTE), versions(text, null)) }
        assertEquals(
            mapOf(
                "bolt11" to listOf(listOf(12, 14, 17, 20), listOf(10, 11, 14, 16)),
                "bip21" to listOf(listOf(13, 16, 19, 22), listOf(11, 13, 16, 18)),
                "lnurl" to listOf(listOf(9, 10, 12, 15), listOf(7, 8, 10, 12)),
                "gs1" to listOf(listOf(4, 5, 6, 8), listOf(3, 4, 5, 6)),
            ),
            table,
        )
    }

    /** The reference encoder's public compact mode, as a bound: our version is never larger. */
    @Test
    fun neverNeedsALargerVersionThanTheReferenceCompactMode() {
        val random = prng(31)
        val runs = listOf("abcdefgh-._~?=&", "0123456789", "ABCDEFGHIJKLMNOPQRSTUVWXYZ \$%*+-./:")
        val levels = ErrorCorrection.values()
        val references = listOf(ErrorCorrectionLevel.L, ErrorCorrectionLevel.M, ErrorCorrectionLevel.Q, ErrorCorrectionLevel.H)
        var same = 0
        val total = 200
        for (t in 0 until total) {
            val text = StringBuilder()
            val length = 1 + (random() * random() * 900).toInt()
            while (text.length < length) {
                val set = runs[(random() * runs.size).toInt()]
                for (k in 0 until 1 + (random() * 24).toInt()) text.append(set[(random() * set.length).toInt()])
            }
            val ecc = t % 4
            val ours = encode(text.toString(), EncodeOptions(ecc = levels[ecc])).version
            val hints = mapOf(EncodeHintType.QR_COMPACT to true)
            val theirs = com.google.zxing.qrcode.encoder.Encoder.encode(text.toString(), references[ecc], hints).version.versionNumber
            assertTrue("#$t: ours v$ours, reference v$theirs", ours <= theirs)
            if (ours == theirs) same++
        }
        println("compact-mode comparison: $same of $total at the same version, the rest smaller")
    }

    @Test
    fun bothReadersReadMixedSegmentsWithAndWithoutEci() {
        val random = prng(20261115)
        val runs = listOf("abcdefghxyz-._~?=&", "0123456789", "ABCDEFGHIJKLMNOPQRSTUVWXYZ \$%*+-./:", "éü☕会")
        val levels = ErrorCorrection.values()
        val problems = ArrayList<String>()
        var mixed = 0
        for (i in 0 until 40) {
            val text = StringBuilder()
            val length = 1 + (random() * random() * 600).toInt()
            while (text.length < length) {
                val set = runs[(random() * runs.size).toInt()]
                for (k in 0 until 1 + (random() * 30).toInt()) text.append(set[(random() * set.length).toInt()])
            }
            val s = text.toString()
            val qr = encode(s, EncodeOptions(ecc = levels[i % 4], eci = i % 2 == 1))
            if (qr.segments.size > 1) mixed++
            var read: String? = null
            for (scale in listOf(4, 2, 3, 5, 6, 8)) {
                read = zxingRead(picture(qr.modules, qr.size, scale))
                if (read != null) break
            }
            // Without the designator the reference reader guesses the encoding, so it is held to ASCII text there.
            val ascii = s.all { it.code < 0x80 }
            if ((ascii || i % 2 == 1) && read != s) problems.add("reference #$i v${qr.version}${qr.ecc} ${qr.segments} read ${read?.length}: $s / $read")
            val g = picture(qr.modules, qr.size, 4)
            if (decode(g.data, g.width, g.height)?.text != s) problems.add("kotlin #$i v${qr.version}${qr.ecc}")
        }
        assertEquals(problems.joinToString("\n"), 0, problems.size)
        assertTrue(mixed > 25)
    }
}
