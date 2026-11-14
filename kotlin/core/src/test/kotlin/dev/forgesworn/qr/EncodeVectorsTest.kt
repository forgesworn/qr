package dev.forgesworn.qr

import org.junit.Assert.assertEquals
import org.junit.Test

class EncodeVectorsTest {
    private val vectors = encodeVectors()

    @Test
    fun hasAllVectorsAndCoversEveryVersionAndMask() {
        assertEquals(114, vectors.size)
        assertEquals(40, vectors.map { it.version }.toSet().size)
        assertEquals(8, vectors.map { it.mask }.toSet().size)
    }

    @Test
    fun reproducesEveryVectorModuleForModule() {
        for (v in vectors) {
            val qr = encode(
                v.text,
                EncodeOptions(ecc = v.ecc, eci = v.eci, version = v.requestedVersion, mask = v.requestedMask),
            )
            assertEquals("${v.id} header", listOf(v.version, v.mask, v.mode, v.size), listOf(qr.version, qr.mask, qr.mode, qr.size))
            assertEquals("${v.id} modules", v.rows, toRows(qr.modules, qr.size))
        }
    }
}
