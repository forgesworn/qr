package dev.forgesworn.qr

import kotlin.math.floor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Large symbols seen through a lens that bends them: one projective map
 * through the finders and an alignment pattern drifts by more than half a
 * module across the symbol, so the ordinary read and the second look's
 * shifts fail, and the mesh over the alignment lattice reads them. The same
 * frames as test/mesh.test.ts. Every payload is made up.
 */
class MeshTest {
    private class Random(seed: Long) {
        private var s = seed and 0xffffffffL

        fun next(): Double {
            s = (s * 1664525L + 1013904223L) and 0xffffffffL
            return s / 4294967296.0
        }
    }

    private val chars = "abcdefghijklmnopqrstuvwxyz0123456789"

    @Test
    fun readsBentLargeSymbolsThroughTheAlignmentLattice() {
        val random = Random(5150)
        for ((version, k) in listOf(12 to 0.04, 25 to 0.02, 40 to 0.02)) {
            for (t in 0 until 2) {
                val text = StringBuilder("https://example.com/m/")
                for (i in 0 until 40) text.append(chars[floor(random.next() * chars.length).toInt()])
                val qr = encode(text.toString(), EncodeOptions(ecc = ErrorCorrection.M, version = version))
                val frame = bent(qr.modules, qr.size, 4, k)
                val work = Work()
                val got = decodeCounted(frame.data, frame.width, frame.height, work)
                assertEquals(text.toString(), got?.text)
                assertEquals(version, got?.version)
                // Read by the second look, through a mesh, within its caps.
                assertTrue(work.meshes > 0)
                assertTrue(work.second <= 4)
            }
        }
    }
}
