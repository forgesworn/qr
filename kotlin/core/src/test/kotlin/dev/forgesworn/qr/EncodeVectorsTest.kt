package dev.forgesworn.qr

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EncodeVectorsTest {
    private val vectors = encodeVectors()

    /** Each vector's segment list, read from the same file. */
    @Suppress("UNCHECKED_CAST")
    private val segments: Map<String, List<Segment>> = run {
        val root = readJsonObject(File(vectorsDir(), "encode-vectors.json"))
        (root["vectors"] as List<Map<String, Any?>>).associate { v ->
            (v["id"] as String) to (v["segments"] as List<Map<String, Any?>>).map {
                Segment(Mode.valueOf((it["mode"] as String).uppercase()), (it["count"] as Long).toInt())
            }
        }
    }

    @Test
    fun hasAllVectorsAndCoversEveryVersionAndMask() {
        assertEquals(147, vectors.size)
        assertEquals(40, vectors.map { it.version }.toSet().size)
        assertEquals(8, vectors.map { it.mask }.toSet().size)
        assertTrue(segments.values.count { it.size > 1 } >= 30)
        // The original 114 vectors are single-segment and the default still produces them.
        assertTrue(vectors.take(114).all { segments.getValue(it.id).size == 1 })
    }

    @Test
    fun reproducesEveryVectorModuleForModule() {
        for (v in vectors) {
            val qr = encode(
                v.text,
                EncodeOptions(ecc = v.ecc, eci = v.eci, version = v.requestedVersion, mask = v.requestedMask),
            )
            assertEquals("${v.id} header", listOf(v.version, v.mask, v.mode, v.size), listOf(qr.version, qr.mask, qr.mode, qr.size))
            assertEquals("${v.id} segments", segments.getValue(v.id), qr.segments)
            assertEquals("${v.id} modules", v.rows, toRows(qr.modules, qr.size))
        }
    }
}
