package dev.forgesworn.qr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A version 40 symbol under a lens whose finders' modules look small, so its
 * size estimate runs past 177: the search tries the retries of 177 or less
 * and reads it. The same frames as test/over.test.ts. Every payload is made up.
 */
class OverTest {
    @Test
    fun readsVersion40SymbolsFromTheRetriesBelowTheEstimate() {
        for (k in doubleArrayOf(0.01, 0.03)) {
            val text = "https://example.com/e/" + "x".repeat(30)
            val qr = encode(text, EncodeOptions(ecc = ErrorCorrection.M, version = 40))
            val frame = bent(qr.modules, qr.size, 4, k)
            val image = binarise(toLuminance(frame.data, frame.width, frame.height, frame.width))
            val triple = finderTriples(image, findFinders(image, 0.5))[0]
            assertEquals(181, estimateSize(image, triple))
            val work = Work()
            val got = decodeCounted(frame.data, frame.width, frame.height, work)
            assertEquals(text, got?.text)
            assertEquals(40, got?.version)
            assertTrue(work.maps <= 4 * 6 * 5 * 6)
            assertTrue(work.second <= 4)
        }
    }
}
