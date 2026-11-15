package dev.forgesworn.qr

import kotlin.math.abs
import kotlin.math.floor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Symbols damaged beyond correction, and frames with no symbol at all, must
 * read as nothing or as the symbol's own text: never as other text. The
 * damaged symbols keep their finders, timing and format information, so the
 * ordinary read fails and the second look runs on them too. The same frames
 * as test/false-reads.test.ts, from the same generator.
 */
class FalseReadsTest {
    private class Random(seed: Long) {
        private var s = seed and 0xffffffffL

        fun next(): Double {
            s = (s * 1664525L + 1013904223L) and 0xffffffffL
            return s / 4294967296.0
        }
    }

    private class Frame(val data: ByteArray, val width: Int, val height: Int)

    private val levels = listOf(ErrorCorrection.L, ErrorCorrection.M, ErrorCorrection.Q, ErrorCorrection.H)
    private val chars = "abcdefghijklmnopqrstuvwxyz0123456789"

    private fun fl(v: Double): Int = floor(v).toInt()

    /** Module positions of each codeword of each block, in the order readSymbol takes them. */
    private fun codewordModules(version: Int, ecc: ErrorCorrection): List<List<List<IntArray>>> {
        val grid = Grid(version)
        val size = 17 + 4 * version
        val (ec, g1, d1, g2) = blocksFor(version, ecc)
        val count = g1 + g2
        val total = g1 * d1 + g2 * (d1 + 1) + count * ec
        val bits = ArrayList<IntArray>()
        var upward = true
        var right = size - 1
        while (right >= 1 && bits.size < total * 8) {
            if (right == 6) right = 5
            for (step in 0 until size) {
                val y = if (upward) size - 1 - step else step
                for (i in 0 until 2) {
                    val x = right - i
                    if (!grid.isReserved(x, y) && bits.size < total * 8) bits.add(intArrayOf(x, y))
                }
            }
            upward = !upward
            right -= 2
        }
        val blocks = List(count) { ArrayList<List<IntArray>>() }
        var k = 0
        fun take(): List<IntArray> = bits.subList(8 * k, 8 * ++k)
        for (i in 0..d1) for (b in 0 until count) if (i < (if (b < g1) d1 else d1 + 1)) blocks[b].add(take())
        for (i in 0 until ec) for (b in 0 until count) blocks[b].add(take())
        return blocks
    }

    /** Draws modules straight, [scale] pixels a module, four modules of quiet zone, with additive noise. */
    private fun draw(modules: ByteArray, size: Int, scale: Int, invert: Boolean, noise: Int, random: Random): Frame {
        val side = (size + 8) * scale
        val data = ByteArray(side * side)
        for (py in 0 until side) {
            for (px in 0 until side) {
                val mx = px / scale - 4
                val my = py / scale - 4
                val dark = mx >= 0 && my >= 0 && mx < size && my < size && modules[my * size + mx].toInt() == 1
                val v = if (dark != invert) 30 else 225
                data[py * side + px] = maxOf(0, minOf(255, v + fl((random.next() * 2 - 1) * noise))).toByte()
            }
        }
        return Frame(data, side, side)
    }

    private enum class Kind { CODEWORDS, BURST, FLIPS }

    private fun damaged(kind: Kind, random: Random): Pair<String, Frame> {
        val length = 1 + fl(random.next() * 120)
        val text = StringBuilder("https://example.com/t/")
        for (i in 0 until length) text.append(chars[fl(random.next() * chars.length)])
        val ecc = levels[fl(random.next() * 4)]
        val mask = fl(random.next() * 8)
        val qr = encode(text.toString(), EncodeOptions(ecc = ecc, mask = mask))
        val size = qr.size
        val version = qr.version
        val modules = qr.modules.copyOf()
        val grid = Grid(version)
        fun flip(x: Int, y: Int) {
            modules[y * size + x] = (modules[y * size + x].toInt() xor 1).toByte()
        }
        when (kind) {
            Kind.CODEWORDS -> {
                // One block, a few codewords past what its parity corrects.
                val blocks = codewordModules(version, ecc)
                val block = blocks[fl(random.next() * blocks.size)]
                val ec = blocksFor(version, ecc)[0]
                val errors = minOf(block.size, ec / 2 + 1 + fl(random.next() * 3))
                val order = IntArray(block.size) { it }
                for (i in 0 until errors) {
                    val j = i + fl(random.next() * (order.size - i))
                    val t = order[i]
                    order[i] = order[j]
                    order[j] = t
                    val bitsToFlip = 1 + fl(random.next() * 255)
                    block[order[i]].forEachIndexed { bit, p -> if (((bitsToFlip ushr (7 - bit)) and 1) == 1) flip(p[0], p[1]) }
                }
            }
            Kind.BURST -> {
                // A rectangle of the data region turned over.
                val w = 3 + fl(random.next() * (size / 2.0))
                val h = 3 + fl(random.next() * (size / 2.0))
                val left = fl(random.next() * (size - w))
                val top = fl(random.next() * (size - h))
                for (y in top until top + h) for (x in left until left + w) if (!grid.isReserved(x, y)) flip(x, y)
            }
            Kind.FLIPS -> {
                // Flips anywhere, finders and format included.
                val rate = 0.08 + random.next() * 0.25
                for (i in modules.indices) if (random.next() < rate) modules[i] = (modules[i].toInt() xor 1).toByte()
            }
        }
        val mirror = random.next() < 0.2
        val drawn = if (mirror) ByteArray(size * size) { modules[(it % size) * size + it / size] } else modules
        val scale = 2 + fl(random.next() * 3)
        val invert = random.next() < 0.2
        val noise = fl(random.next() * 40)
        return text.toString() to draw(drawn, size, scale, invert, noise, random)
    }

    private fun fill(width: Int, height: Int, f: (Int, Int) -> Int): Frame {
        val data = ByteArray(width * height)
        for (y in 0 until height) for (x in 0 until width) data[y * width + x] = f(x, y).toByte()
        return Frame(data, width, height)
    }

    /** Frames with no symbol in them. */
    private fun empty(random: Random): List<Frame> {
        val frames = ArrayList<Frame>()
        for (i in 0 until 4) frames.add(fill(320, 240) { _, _ -> fl(random.next() * 256) })
        frames.add(fill(320, 240) { _, _ -> if (random.next() < 0.5) 0 else 255 })
        frames.add(fill(320, 240) { _, _ -> 200 })
        frames.add(fill(320, 240) { x, _ -> if ((x / 4) % 2 != 0) 20 else 230 })
        frames.add(fill(320, 240) { x, y -> if ((x / 6 + y / 6) % 2 != 0) 20 else 230 })
        // Finder patterns at 2 px a module on a 20 px pitch, nothing between.
        frames.add(
            fill(320, 240) { x, y ->
                val i = (x % 20) / 2
                val j = (y % 20) / 2
                if (i < 7 && j < 7 && maxOf(abs(i - 3), abs(j - 3)) != 2) 20 else 230
            },
        )
        return frames
    }

    @Test
    fun readsDamagedSymbolsAsNothingOrTheirOwnText() {
        val random = Random(2718)
        var codewordTrials = 0
        var codewordNothing = 0
        var codewordSecondLook = 0
        for ((kind, n) in listOf(Kind.CODEWORDS to 160, Kind.BURST to 40, Kind.FLIPS to 40)) {
            for (i in 0 until n) {
                val (text, frame) = damaged(kind, random)
                val work = Work()
                val got = decodeCounted(frame.data, frame.width, frame.height, work)
                if (got != null) assertEquals(text, got.text)
                assertTrue(work.second <= 4)
                if (kind == Kind.CODEWORDS) {
                    codewordTrials++
                    if (got == null) codewordNothing++
                    if (work.second > 0) codewordSecondLook++
                }
            }
        }
        // Damage past the parity reads as nothing, and the second look ran on nearly every one.
        assertEquals(codewordTrials, codewordNothing)
        assertTrue(codewordSecondLook >= 0.9 * codewordTrials)
    }

    @Test
    fun readsFramesWithNoSymbolAsNothing() {
        for (frame in empty(Random(31))) {
            val work = Work()
            assertNull(decodeCounted(frame.data, frame.width, frame.height, work))
            assertTrue(work.second <= 4)
        }
    }
}
