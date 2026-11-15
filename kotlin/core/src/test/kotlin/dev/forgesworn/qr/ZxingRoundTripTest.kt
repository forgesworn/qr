package dev.forgesworn.qr

import java.util.Random
import org.junit.Assert.assertEquals
import org.junit.Test

class ZxingRoundTripTest {
    private val alphanumeric = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ \$%*+-./:"
    private val printable = (0x20..0x7E).map { it.toChar() }
    private val unicode = "éüñß€☃中文Жд".toList()

    private fun random(random: Random, chars: List<Char>, max: Int) =
        String(CharArray(1 + random.nextInt(max)) { chars[random.nextInt(chars.size)] })

    /**
     * ZXing's detector sometimes misses the alignment pattern of a pixel-perfect picture
     * (its own encoder's output included), so try a few module sizes before calling it a miss.
     */
    private fun zxingReadAtAnyScale(qr: QrCode, first: Int): String? {
        for (scale in listOf(first, 2, 3, 5, 6, 8)) {
            val read = zxingRead(picture(qr.modules, qr.size, scale))
            if (read != null) return read
        }
        return null
    }

    @Test
    fun zxingAndKotlinReadWhatKotlinEncodes() {
        val random = Random(7)
        val levels = ErrorCorrection.values()
        val problems = ArrayList<String>()
        for (i in 0 until 80) {
            val (text, eci) = when (i % 4) {
                0 -> random(random, "0123456789".toList(), 300) to false
                1 -> random(random, alphanumeric.toList(), 200) to false
                2 -> random(random, printable, 300) to false
                else -> random(random, unicode + printable, 100) to true
            }
            val qr = encode(text, EncodeOptions(ecc = levels[i % 4], eci = eci))
            val g = picture(qr.modules, qr.size, 4)
            if (zxingReadAtAnyScale(qr, 4) != text) problems.add("zxing #$i v${qr.version}${qr.ecc} ${qr.mode} mask ${qr.mask}: $text")
            if (decode(g.data, g.width, g.height)?.text != text) problems.add("kotlin #$i v${qr.version}${qr.ecc}")
        }
        assertEquals(problems.joinToString("\n"), 0, problems.size)
    }

    /**
     * Every version at every level, filled to the last byte, and every mask at
     * version 23 (level L there has two block sizes, 121 and 122 data
     * codewords). The reference decoder reads the module grid directly, so a
     * miss is the encoder's and not a detector's.
     */
    @Test
    fun referenceDecoderReadsEveryVersionAndLevelAtFullCapacity() {
        val random = Random(23)
        val letters = "abcdefghijklmnopqrstuvwxyz -_.~/?=&".toList()
        val problems = ArrayList<String>()
        var cells = 0
        for (version in 1..40) {
            for (ecc in ErrorCorrection.values()) {
                val b = blocksFor(version, ecc)
                val codewords = b[1] * b[2] + b[3] * (b[2] + 1)
                // A byte segment's header is 4 bits of mode and 8 or 16 of count.
                val capacity = codewords - if (version <= 9) 2 else 3
                val text = String(CharArray(capacity) { letters[random.nextInt(letters.size)] })
                val masks: List<Int?> = if (version == 23) (0..7).toList() else listOf(null)
                for (mask in masks) {
                    cells++
                    val qr = encode(text, EncodeOptions(ecc = ecc, version = version, mask = mask, mode = Mode.BYTE))
                    val name = "v$version$ecc mask ${qr.mask}"
                    if (qr.version != version) problems.add("$name: version ${qr.version}")
                    if (zxingReadModules(qr.modules, qr.size) != text) problems.add("reference $name")
                    if (decodeModules(qr.modules, qr.size)?.text != text) problems.add("kotlin $name")
                }
            }
        }
        assertEquals(188, cells)
        assertEquals(problems.joinToString("\n"), 0, problems.size)
        // One byte more must not fit.
        try {
            encode("a".repeat(1092), EncodeOptions(ecc = ErrorCorrection.L, version = 23, mode = Mode.BYTE))
            throw AssertionError("1,092 bytes fitted version 23 level L")
        } catch (_: QrCapacityError) {
            // Expected: the cell holds 1,091.
        }
    }
}
