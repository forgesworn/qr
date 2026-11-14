package dev.forgesworn.qr

import java.util.Random
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class ReedSolomonTest {
    /** Check codewords for [data], generator roots a^0 .. a^(degree - 1), by long division. */
    private fun checks(data: IntArray, degree: Int): IntArray {
        // Generator, highest power first, monic.
        var gen = intArrayOf(1)
        for (i in 0 until degree) {
            val next = IntArray(gen.size + 1)
            for (j in gen.indices) {
                next[j] = next[j] xor gen[j]
                next[j + 1] = next[j + 1] xor gfMul(gen[j], EXP[i])
            }
            gen = next
        }
        val rem = IntArray(degree)
        for (d in data) {
            val factor = d xor rem[0]
            for (k in 0 until degree - 1) rem[k] = rem[k + 1]
            rem[degree - 1] = 0
            for (k in 0 until degree) rem[k] = rem[k] xor gfMul(gen[k + 1], factor)
        }
        return rem
    }

    private fun block(random: Random, dataLength: Int, degree: Int): IntArray {
        val data = IntArray(dataLength) { random.nextInt(256) }
        return data + checks(data, degree)
    }

    @Test
    fun fieldTablesAreConsistent() {
        assertEquals(1, EXP[0])
        assertEquals(2, EXP[1])
        assertEquals(0x1D, EXP[8])
        for (a in 1..255) assertEquals(a, EXP[LOG[a]])
        for (a in 1..255) assertEquals(1, gfMul(a, EXP[255 - LOG[a]]))
        assertEquals(0, gfMul(0, 77))
    }

    @Test
    fun cleanBlockNeedsNoCorrection() {
        val random = Random(1)
        for (degree in intArrayOf(7, 10, 17, 30)) {
            val b = block(random, 20, degree)
            val copy = b.copyOf()
            assertEquals(0, correct(b, degree))
            assertArrayEquals(copy, b)
        }
    }

    @Test
    fun correctsUpToHalfTheCheckCodewordsAnywhereInTheBlock() {
        val random = Random(2)
        for (degree in intArrayOf(7, 10, 13, 18, 22, 30)) {
            repeat(20) {
                val original = block(random, 12 + random.nextInt(60), degree)
                val received = original.copyOf()
                val errors = 1 + random.nextInt(degree / 2)
                val positions = HashSet<Int>()
                while (positions.size < errors) positions.add(random.nextInt(received.size))
                for (p in positions) received[p] = received[p] xor (1 + random.nextInt(255))
                assertEquals("degree $degree", errors, correct(received, degree))
                assertArrayEquals(original, received)
            }
        }
    }

    @Test
    fun refusesOrMiscorrectsPastTheLimitButNeverReturnsTheOriginal() {
        val random = Random(3)
        val degree = 10
        var refused = 0
        repeat(40) {
            val original = block(random, 30, degree)
            val received = original.copyOf()
            val positions = HashSet<Int>()
            while (positions.size < degree / 2 + 2) positions.add(random.nextInt(received.size))
            for (p in positions) received[p] = received[p] xor (1 + random.nextInt(255))
            val n = correct(received, degree)
            if (n == -1) refused++ else assertFalse(original.contentEquals(received))
        }
        // Most over-limit blocks are detected, not silently mended.
        assertEquals(true, refused > 20)
    }
}
