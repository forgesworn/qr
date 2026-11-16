package dev.forgesworn.qr

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertSame
import org.junit.Test

class ByteLuminanceTest {
    @Test
    fun borrowsOnlyAnExactlyPackedPlaneAndDoesNotMutateIt() {
        val packed = ByteArray(256) { it.toByte() }
        val original = packed.copyOf()
        val image = toLuminance(packed, 16, 16, 16)
        assertSame(packed, image.data)
        assertArrayEquals(ByteArray(256) { (255 - it).toByte() }, invertLuminance(image).data)
        val threshold = thresholds(image)
        assertEquals(127.5, threshold.values[0], 0.0)
        assertArrayEquals(ByteArray(256) { if (it <= 127) 1 else 0 }, binarise(image, threshold).data)
        Reductions(image).by(8)
        assertArrayEquals(original, packed)

        val padded = byteArrayOf(1, 2, 99, 99, 3, 4, 99, 99)
        val compact = toLuminance(padded, 2, 2, 4)
        assertNotSame(padded, compact.data)
        assertArrayEquals(byteArrayOf(1, 2, 3, 4), compact.data)
        val oversized = byteArrayOf(1, 2, 3, 4, 99)
        val trimmed = toLuminance(oversized, 2, 2, 2)
        assertNotSame(oversized, trimmed.data)
        assertArrayEquals(byteArrayOf(1, 2, 3, 4), trimmed.data)
        assertArrayEquals(byteArrayOf(1, 2, 99, 99, 3, 4, 99, 99), padded)
        assertArrayEquals(byteArrayOf(1, 2, 3, 4, 99), oversized)
    }

    @Test
    fun argbUsesUnsignedChannelsAndBlendsEveryAlphaOntoWhite() {
        val pixels = IntArray(256) { a -> (a shl 24) or (201 shl 16) or (127 shl 8) or 9 }
        val original = pixels.copyOf()
        val grey = (201 * 77 + 127 * 150 + 9 * 29) shr 8
        val expected = ByteArray(256) { a -> ((grey * a + 255 * (255 - a)) / 255).toByte() }
        assertArrayEquals(expected, toLuminance(pixels, 16, 16, 16).data)
        assertArrayEquals(original, pixels)
    }

    @Test
    fun bothReductionPathsMatchUnsignedBoxMeansWithTails() {
        val width = 19
        val height = 17
        val data = ByteArray(width * height) { ((it * 73 + 191) and 0xff).toByte() }
        val original = data.copyOf()
        val image = toLuminance(data, width, height, width)
        val reductions = Reductions(image)
        for (f in intArrayOf(8, 2, 4, 8)) {
            val w = width / f
            val h = height / f
            val expected = ByteArray(w * h) { i ->
                val x = (i % w) * f
                val y = (i / w) * f
                var sum = 0
                for (dy in 0 until f) for (dx in 0 until f) sum += (data[(y + dy) * width + x + dx].toInt() and 0xff)
                ((sum + f * f / 2) / (f * f)).toByte()
            }
            assertArrayEquals(expected, shrink(image, f).data)
            assertArrayEquals(expected, reductions.by(f).data)
        }
        assertArrayEquals(original, data)
    }
}
