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
        // A third are short and have no prefix, so version 1 symbols are drawn too.
        val short = random.next() < 1.0 / 3
        val length = 1 + fl(random.next() * (if (short) 12 else 120))
        val text = StringBuilder(if (short) "" else "https://example.com/t/")
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

    /**
     * A symbol of a version with an alignment lattice (7 to 40), one block a few
     * codewords past its parity, finders, timing and format whole, drawn through
     * a lens bent by 0, 0.01 or 0.02, so the second look reads it through a mesh.
     */
    private fun damagedLarge(random: Random, only: Int? = null, lens: DoubleArray = doubleArrayOf(0.0, 0.01, 0.02)): Pair<String, Frame> {
        val version = only ?: (7 + fl(random.next() * 34))
        val ecc = levels[fl(random.next() * 4)]
        val mask = fl(random.next() * 8)
        val length = 1 + fl(random.next() * 60)
        val text = StringBuilder("https://example.com/t/")
        for (i in 0 until length) text.append(chars[fl(random.next() * chars.length)])
        val qr = encode(text.toString(), EncodeOptions(ecc = ecc, mask = mask, version = version))
        val size = qr.size
        val modules = qr.modules.copyOf()
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
            block[order[i]].forEachIndexed { bit, p ->
                if (((bitsToFlip ushr (7 - bit)) and 1) == 1) modules[p[1] * size + p[0]] = (modules[p[1] * size + p[0]].toInt() xor 1).toByte()
            }
        }
        val mirror = random.next() < 0.2
        val drawn = if (mirror) ByteArray(size * size) { modules[(it % size) * size + it / size] } else modules
        val k = lens[fl(random.next() * lens.size)]
        val invert = random.next() < 0.2
        val picture = bent(drawn, size, 3, k, invert)
        return text.toString() to Frame(picture.data, picture.width, picture.height)
    }

    /**
     * A symbol of version 1 to 4 drawn with large modules, 16, 24 or 32 pixels,
     * so the reduced-size pass finds it at every factor. CODEWORDS damages one
     * block one to three codewords past what it may correct, finders, timing
     * and format whole; FLIPS turns over modules anywhere.
     */
    private fun damagedClose(kind: Kind, random: Random): Pair<String, Frame> {
        val version = 1 + fl(random.next() * 4)
        val ecc = levels[fl(random.next() * 4)]
        val mask = fl(random.next() * 8)
        // Up to the bytes the version holds at level H, so the text fits at any level.
        val length = 1 + fl(random.next() * intArrayOf(7, 14, 24, 34)[version - 1])
        val text = StringBuilder()
        for (i in 0 until length) text.append(chars[fl(random.next() * chars.length)])
        val qr = encode(text.toString(), EncodeOptions(ecc = ecc, mask = mask, version = version))
        val size = qr.size
        val modules = qr.modules.copyOf()
        if (kind == Kind.CODEWORDS) {
            val blocks = codewordModules(qr.version, ecc)
            val block = blocks[fl(random.next() * blocks.size)]
            // One to three errors past what Table 9 lets the block correct.
            val errors = minOf(block.size, correctable(qr.version, ecc) + 1 + fl(random.next() * 3))
            val order = IntArray(block.size) { it }
            for (i in 0 until errors) {
                val j = i + fl(random.next() * (order.size - i))
                val t = order[i]
                order[i] = order[j]
                order[j] = t
                val bitsToFlip = 1 + fl(random.next() * 255)
                block[order[i]].forEachIndexed { bit, p ->
                    if (((bitsToFlip ushr (7 - bit)) and 1) == 1) modules[p[1] * size + p[0]] = (modules[p[1] * size + p[0]].toInt() xor 1).toByte()
                }
            }
        } else {
            val rate = 0.04 + random.next() * 0.12
            for (i in modules.indices) if (random.next() < rate) modules[i] = (modules[i].toInt() xor 1).toByte()
        }
        val mirror = random.next() < 0.2
        val drawn = if (mirror) ByteArray(size * size) { modules[(it % size) * size + it / size] } else modules
        val scale = intArrayOf(16, 24, 32)[fl(random.next() * 3)]
        val invert = random.next() < 0.2
        val noise = fl(random.next() * 40)
        return text.toString() to draw(drawn, size, scale, invert, noise, random)
    }

    /** A symbol of nothing but zero codewords, as ZeroTest builds it: the mask pattern alone in the data region. */
    private fun zeroSymbol(version: Int, ecc: ErrorCorrection, mask: Int): Pair<ByteArray, Int> {
        val b = blocksFor(version, ecc)
        val grid = Grid(version)
        grid.placeData(IntArray(b[1] * b[2] + b[3] * (b[2] + 1) + b[0] * (b[1] + b[3])))
        return grid.render(ecc, mask) to grid.size
    }

    /** Of the reduced sizes 8, 4 and 2, how many hold a finder triple in either polarity. */
    private fun factorsWithTriples(frame: Frame): Int {
        val luminance = toLuminance(frame.data, frame.width, frame.height, frame.width)
        var count = 0
        for (f in intArrayOf(8, 4, 2)) {
            val bits = binarise(shrink(luminance, f))
            if (listOf(bits, invert(bits)).any { finderTriples(it, findFinders(it, 0.8)).isNotEmpty() }) count++
        }
        return count
    }

    /** Whether a triple the search locates estimates the size past 177, by no more than 8. */
    private fun over(frame: Frame): Boolean {
        val bits = binarise(toLuminance(frame.data, frame.width, frame.height, frame.width))
        for (image in listOf(bits, invert(bits))) {
            for (tolerance in doubleArrayOf(0.5, 0.8)) {
                for (triple in finderTriples(image, findFinders(image, tolerance)).take(6)) {
                    val size = estimateSize(image, triple)
                    if (size != null && size > 177 && size <= 185) return true
                }
            }
        }
        return false
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

    /** Larger frames with no symbol in them, whose shapes survive shrinking. */
    private fun emptyLarge(random: Random): List<Frame> {
        val frames = ArrayList<Frame>()
        frames.add(fill(640, 480) { _, _ -> fl(random.next() * 256) })
        // Noise in 8 px squares, and in 16 px squares of black and white.
        val coarse = IntArray(80 * 60) { fl(random.next() * 256) }
        frames.add(fill(640, 480) { x, y -> coarse[(y / 8) * 80 + x / 8] })
        val blocks = IntArray(40 * 30) { if (random.next() < 0.5) 20 else 230 }
        frames.add(fill(640, 480) { x, y -> blocks[(y / 16) * 40 + x / 16] })
        // Finder patterns at 8 and at 16 px a module, nothing between.
        for ((m, pitch, width, height) in listOf(intArrayOf(8, 80, 640, 480), intArrayOf(16, 160, 960, 640))) {
            frames.add(
                fill(width, height) { x, y ->
                    val i = (x % pitch) / m
                    val j = (y % pitch) / m
                    if (i < 7 && j < 7 && maxOf(abs(i - 3), abs(j - 3)) != 2) 20 else 230
                },
            )
        }
        // Lines of text-like glyphs: 4 x 6 cells of 3 px, each dark at random.
        val glyphs = BooleanArray(50 * 16 * 24) { random.next() < 0.4 }
        frames.add(
            fill(800, 600) { x, y ->
                val line = y / 36
                val row = y % 36
                val letter = x / 16
                val col = x % 16
                if (line >= 16 || row >= 18 || col >= 12) {
                    235
                } else if (glyphs[(line * 50 + letter) * 24 + (row / 3) * 4 + col / 3]) {
                    25
                } else {
                    235
                }
            },
        )
        // A 24 px checkerboard.
        frames.add(fill(640, 480) { x, y -> if ((x / 24 + y / 24) % 2 != 0) 20 else 230 })
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
    fun readsDamagedLargeSymbolsThroughTheMeshAsNothing() {
        // A seed of its own, so the frames above stay as they were.
        val random = Random(4049)
        val trials = 30
        var meshed = 0
        for (i in 0 until trials) {
            val (text, frame) = damagedLarge(random)
            val work = Work()
            val got = decodeCounted(frame.data, frame.width, frame.height, work)
            if (got != null) assertEquals(text, got.text)
            assertNull(got)
            assertTrue(work.second <= 4)
            assertTrue(work.probed <= MESH_PROBES)
            if (work.meshes > 0) meshed++
        }
        // The mesh was reached on nearly every one.
        assertTrue(meshed >= 0.9 * trials)
    }

    @Test
    fun readsDamagedVersion40SymbolsEstimatedPast177AsNothing() {
        // Under the lens the finders' modules look small, so the estimate runs past
        // 177 and only the retries below it are tried.
        val random = Random(4051)
        val trials = 10
        var past = 0
        var meshed = 0
        for (i in 0 until trials) {
            val (text, frame) = damagedLarge(random, 40, doubleArrayOf(0.02))
            val work = Work()
            val got = decodeCounted(frame.data, frame.width, frame.height, work)
            if (got != null) assertEquals(text, got.text)
            assertNull(got)
            assertTrue(work.maps <= 4 * 6 * 5 * 6)
            assertTrue(work.second <= 4)
            assertTrue(work.probed <= MESH_PROBES)
            if (over(frame)) past++
            if (work.meshes > 0) meshed++
        }
        // The estimate ran past 177 on nearly every one, and the maps from the
        // retries below it took most of them to the second look's mesh.
        assertTrue(past >= 0.9 * trials)
        assertTrue(meshed >= 0.7 * trials)
    }

    @Test
    fun readsDamagedCloseUpSymbolsAtReducedSizeAsNothingOrTheirOwnText() {
        // A seed of its own. Nothing reads these at full size, so the reduced-size
        // pass runs; with maps to spare and a triple at every factor, it maps at each.
        val random = Random(6131)
        var trials = 0
        var reached = 0
        var everyFactor = 0
        for ((kind, n) in listOf(Kind.CODEWORDS to 200, Kind.FLIPS to 100)) {
            for (i in 0 until n) {
                val (text, frame) = damagedClose(kind, random)
                val work = Work()
                val got = decodeCounted(frame.data, frame.width, frame.height, work)
                if (got != null) assertEquals(text, got.text)
                assertTrue(work.maps <= 4 * 6 * 5 * 6)
                assertTrue(work.second <= 4)
                assertTrue(work.probed <= MESH_PROBES)
                if (kind == Kind.CODEWORDS) {
                    assertNull(got)
                    trials++
                    if (work.reduced > 0) reached++
                    if (work.maps < 4 * 6 * 5 * 6 && factorsWithTriples(frame) == 3) everyFactor++
                }
            }
        }
        assertEquals(trials, reached)
        assertTrue(everyFactor >= 0.9 * trials)
    }

    @Test
    fun readsCloseUpSymbolsOfNothingButZeroCodewordsAsNothingAtEverySize() {
        // Nothing reads them at full size, so the reduced-size pass runs on each.
        val random = Random(6133)
        var trials = 0
        var everyFactor = 0
        val cases = listOf(1 to ErrorCorrection.H, 1 to ErrorCorrection.L, 2 to ErrorCorrection.L, 5 to ErrorCorrection.Q)
        for ((version, ecc) in cases) {
            for (mask in 0 until 8) {
                val (modules, size) = zeroSymbol(version, ecc, mask)
                for (scale in intArrayOf(16, 24)) {
                    val mirror = random.next() < 0.5
                    val drawn = if (mirror) ByteArray(size * size) { modules[(it % size) * size + it / size] } else modules
                    val invert = random.next() < 0.5
                    val noise = fl(random.next() * 40)
                    val frame = draw(drawn, size, scale, invert, noise, random)
                    val work = Work()
                    assertNull("$version$ecc mask $mask at $scale", decodeCounted(frame.data, frame.width, frame.height, work))
                    assertTrue(work.reduced > 0)
                    assertTrue(work.maps <= 4 * 6 * 5 * 6)
                    assertTrue(work.second <= 4)
                    trials++
                    if (work.maps < 4 * 6 * 5 * 6 && factorsWithTriples(frame) == 3) everyFactor++
                }
            }
        }
        assertTrue(everyFactor >= 0.9 * trials)
    }

    @Test
    fun readsLargerFramesWithNoSymbolAsNothingAtEverySize() {
        var reached = 0
        for (frame in emptyLarge(Random(37))) {
            val work = Work()
            assertNull(decodeCounted(frame.data, frame.width, frame.height, work))
            assertTrue(work.maps <= 4 * 6 * 5 * 6)
            assertTrue(work.second <= 4)
            if (work.reduced > 0) reached++
        }
        // The finder tiles at least are mapped at reduced size.
        assertTrue(reached >= 2)
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
