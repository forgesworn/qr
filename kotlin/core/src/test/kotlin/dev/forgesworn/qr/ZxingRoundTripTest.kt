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
}
