package dev.forgesworn.qr

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReadScratchTest {
    private fun counts(work: Work) = listOf(work.steps, work.compared, work.scanned, work.maps, work.second, work.meshes, work.probed, work.reduced)

    @Test
    fun alternatingSizesAndPolaritiesAfterDamagedFormatsStayIndependent() {
        for (version in listOf(1, 12, 7, 1)) {
            val qr = encode("hello", EncodeOptions(version = version))
            val damaged = qr.modules.copyOf()
            // Damage both copies, leaving the finders intact so search still
            // attempts maps rather than rejecting the image before reading.
            for (i in 0 until 15) {
                val first = FORMAT_COORDS[i]
                damaged[first[1] * qr.size + first[0]] = 0
                val x = if (i < 8) qr.size - 1 - i else 8
                val y = if (i < 8) 8 else qr.size - 7 + i - 8
                damaged[y * qr.size + x] = 0
            }
            for (inverted in listOf(false, true)) {
                val bad = picture(damaged, qr.size, 3, invert = inverted)
                val first = Work()
                val second = Work()
                assertNull(decodeCounted(bad.data, bad.width, bad.height, first))
                assertNull(decodeCounted(bad.data, bad.width, bad.height, second))
                assertTrue(first.maps > 0)
                assertEquals(counts(first), counts(second))

                val good = picture(qr.modules, qr.size, 3, invert = inverted)
                val work = Work()
                val result = decodeCounted(good.data, good.width, good.height, work)!!
                assertEquals("hello", result.text)
                assertArrayEquals("hello".toByteArray(), result.bytes)
                assertEquals(version, result.version)
                assertEquals(inverted, result.inverted)
                assertTrue(work.maps > 0)
            }
        }
    }
}
