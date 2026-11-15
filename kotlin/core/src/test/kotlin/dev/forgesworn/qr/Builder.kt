package dev.forgesworn.qr

// Builds symbols from raw segments, so tests can reach headers and modes the
// encoder never writes (structured append, FNC1, kanji, ECI). It has its own
// Reed-Solomon and interleave, apart from Encode.kt.

internal fun bitsOf(value: Int, length: Int): List<Int> = (length - 1 downTo 0).map { (value ushr it) and 1 }

private fun remainder(data: IntArray, degree: Int): IntArray {
    var gen = intArrayOf(1)
    for (i in 0 until degree) {
        val next = IntArray(gen.size + 1)
        for (j in gen.indices) {
            next[j] = next[j] xor gen[j]
            next[j + 1] = next[j + 1] xor gfMul(gen[j], EXP[i])
        }
        gen = next
    }
    val out = IntArray(degree)
    for (byte in data) {
        val factor = byte xor out[0]
        System.arraycopy(out, 1, out, 0, degree - 1)
        out[degree - 1] = 0
        for (i in 0 until degree) out[i] = out[i] xor gfMul(gen[i + 1], factor)
    }
    return out
}

internal class Built(val modules: ByteArray, val size: Int)

/** Pads [bits] to the capacity of [version] and [ecc] and lays out the finished symbol. */
internal fun symbol(bits: List<Int>, version: Int, ecc: ErrorCorrection, mask: Int): Built {
    val b = blocksFor(version, ecc)
    val ec = b[0]
    val g1 = b[1]
    val d1 = b[2]
    val g2 = b[3]
    val capacity = (g1 * d1 + g2 * (d1 + 1)) * 8
    require(bits.size <= capacity) { "Too long for the symbol" }
    val all = ArrayList(bits)
    var i = 0
    while (i < 4 && all.size < capacity) {
        all.add(0)
        i++
    }
    while (all.size % 8 != 0) all.add(0)
    val words = IntArray(capacity / 8)
    for (k in 0 until all.size / 8) words[k] = (0 until 8).fold(0) { a, j -> (a shl 1) or all[k * 8 + j] }
    var pad = 0xec
    for (k in all.size / 8 until words.size) {
        words[k] = pad
        pad = pad xor 0xec xor 0x11
    }

    val data = ArrayList<IntArray>()
    val checks = ArrayList<IntArray>()
    var offset = 0
    for (blk in 0 until g1 + g2) {
        val length = if (blk < g1) d1 else d1 + 1
        val block = words.copyOfRange(offset, offset + length)
        offset += length
        data.add(block)
        checks.add(remainder(block, ec))
    }
    val stream = ArrayList<Int>()
    for (k in 0..d1) for (block in data) if (k < block.size) stream.add(block[k])
    for (k in 0 until ec) for (block in checks) stream.add(block[k])
    val grid = Grid(version)
    grid.placeData(stream.toIntArray())
    return Built(grid.render(ecc, mask), grid.size)
}

/** Segments; `countBits` is the character count length for the version's band. */
internal object Seg {
    fun numeric(text: String, countBits: Int): List<Int> {
        val out = ArrayList(bitsOf(1, 4) + bitsOf(text.length, countBits))
        for (i in text.indices step 3) {
            val group = text.substring(i, minOf(i + 3, text.length))
            out.addAll(bitsOf(group.toInt(), group.length * 3 + 1))
        }
        return out
    }

    fun alnum(text: String, countBits: Int): List<Int> {
        val out = ArrayList(bitsOf(2, 4) + bitsOf(text.length, countBits))
        for (i in text.indices step 2) {
            val a = ALPHANUMERIC.indexOf(text[i])
            out.addAll(if (i + 1 < text.length) bitsOf(a * 45 + ALPHANUMERIC.indexOf(text[i + 1]), 11) else bitsOf(a, 6))
        }
        return out
    }

    fun bytes(bytes: IntArray, countBits: Int): List<Int> =
        bitsOf(4, 4) + bitsOf(bytes.size, countBits) + bytes.flatMap { bitsOf(it, 8) }

    fun bytes(bytes: ByteArray, countBits: Int): List<Int> = bytes(IntArray(bytes.size) { bytes[it].toInt() and 0xff }, countBits)

    fun kanji(values: List<Int>, countBits: Int): List<Int> =
        bitsOf(8, 4) + bitsOf(values.size, countBits) + values.flatMap { bitsOf(it, 13) }

    fun eci(value: Int): List<Int> = bitsOf(7, 4) + (if (value < 128) bitsOf(value, 8) else bitsOf(0x8000 or value, 16))

    fun structuredAppend(index: Int, total: Int, parity: Int): List<Int> =
        bitsOf(3, 4) + bitsOf(index, 4) + bitsOf(total - 1, 4) + bitsOf(parity, 8)

    fun fncFirst(): List<Int> = bitsOf(5, 4)

    fun fncSecond(indicator: Int): List<Int> = bitsOf(9, 4) + bitsOf(indicator, 8)
}
