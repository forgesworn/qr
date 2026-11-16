package dev.forgesworn.qr

/**
 * What a symbol says, once read.
 *
 * @property text The decoded text.
 * @property bytes The payload as bytes: byte-mode data as stored, numeric and alphanumeric as ASCII.
 * @property eci ECI assignment numbers in the order they appeared; empty if none.
 * @property corrected Codewords Reed-Solomon had to correct.
 * @property structuredAppend Set when the symbol is one of a structured-append set; [text] and [bytes] then hold this symbol's part only.
 * @property fnc1 Set when the symbol carries an FNC1 indicator.
 */
internal class Payload(
    val text: String,
    val bytes: ByteArray,
    val version: Int,
    val ecc: ErrorCorrection,
    val mask: Int,
    val eci: List<Int>,
    val corrected: Int,
    val structuredAppend: StructuredAppend? = null,
    val fnc1: Fnc1? = null,
)

/** The header of a structured-append symbol. */
data class StructuredAppend(
    /** This symbol's place in the set, counting from 0. */
    val index: Int,
    /** How many symbols the set has, 1 to 16. */
    val total: Int,
    /** The parity byte: the XOR of every byte of the whole message, the same in each symbol of the set. */
    val parity: Int,
)

/** Which FNC1 indicator a symbol carries. */
enum class Fnc1Position {
    /** The GS1 format. */
    FIRST,

    /** An industry application, named by an application indicator. */
    SECOND,
}

/**
 * An FNC1 indicator. In alphanumeric segments `%` then reads as the group
 * separator U+001D and `%%` as `%`, in text and bytes alike.
 *
 * @property applicationIndicator Second position only: one letter or two digits, as a string.
 */
data class Fnc1(val position: Fnc1Position, val applicationIndicator: String? = null)

/** Reads modules through a callback: true for dark, x across, y down. */
internal fun interface ModuleReader {
    fun read(x: Int, y: Int): Boolean
}

private class FormatEntry(val bits: Int, val ecc: ErrorCorrection, val mask: Int)

private class VersionEntry(val bits: Int, val version: Int)

private val FORMATS: List<FormatEntry> = EC_ORDER.flatMap { ecc ->
    (0..7).map { mask -> FormatEntry(formatBits(ecc, mask), ecc, mask) }
}
private val VERSIONS: List<VersionEntry> = (0 until 34).map { i -> VersionEntry(versionBits(i + 7), i + 7) }

private val PLACEMENTS = java.util.concurrent.atomic.AtomicReferenceArray<IntArray>(41)

/**
 * The modules of a version that carry the bit stream, in the order the
 * standard places it: two columns at a time from the right, snaking up and
 * down, skipping the function patterns. Each is y * 256 + x. Worked out once
 * a version and kept; two threads that both work one out keep equal arrays.
 */
private fun placement(version: Int): IntArray {
    PLACEMENTS.get(version)?.let { return it }
    val grid = Grid(version)
    val size = 17 + 4 * version
    val found = IntArray(size * size)
    var n = 0
    var upward = true
    var right = size - 1
    while (right >= 1) {
        if (right == 6) right = 5
        for (step in 0 until size) {
            val y = if (upward) size - 1 - step else step
            for (i in 0 until 2) {
                val x = right - i
                if (!grid.isReserved(x, y)) found[n++] = (y shl 8) or x
            }
        }
        upward = !upward
        right -= 2
    }
    val places = found.copyOf(n)
    PLACEMENTS.set(version, places)
    return places
}

private fun popcount(value: Int): Int {
    var n = value
    var c = 0
    while (n != 0) {
        n = n and (n - 1)
        c++
    }
    return c
}

private fun <T> nearest(table: List<T>, bitsOf: (T) -> Int, reads: IntArray): T? {
    var best: T? = null
    var distance = 4 // both codes correct up to three bit errors
    for (read in reads) {
        for (entry in table) {
            val d = popcount(bitsOf(entry) xor read)
            if (d < distance) {
                distance = d
                best = entry
            }
        }
    }
    return best
}

/**
 * The version a symbol of [size] modules declares: from the size below
 * version 7, else from its version blocks, or null when neither copy decodes.
 */
internal fun readVersion(read: ModuleReader, size: Int): Int? {
    if (size < 45) return (size - 17) / 4
    var bottomLeft = 0
    var topRight = 0
    for (k in 17 downTo 0) {
        val i = k / 3
        val j = k % 3
        bottomLeft = (bottomLeft shl 1) or (if (read.read(i, size - 11 + j)) 1 else 0)
        topRight = (topRight shl 1) or (if (read.read(size - 11 + j, i)) 1 else 0)
    }
    return nearest(VERSIONS, { it.bits }, intArrayOf(bottomLeft, topRight))?.version
}

/** Both version copies must independently decode to the same version. */
internal fun agreedVersion(read: ModuleReader, size: Int): Int? {
    if (size < 45) return null
    var bottomLeft = 0
    var topRight = 0
    for (k in 17 downTo 0) {
        val i = k / 3
        val j = k % 3
        bottomLeft = (bottomLeft shl 1) or (if (read.read(i, size - 11 + j)) 1 else 0)
        topRight = (topRight shl 1) or (if (read.read(size - 11 + j, i)) 1 else 0)
    }
    val first = nearest(VERSIONS, { it.bits }, intArrayOf(bottomLeft))?.version ?: return null
    val second = nearest(VERSIONS, { it.bits }, intArrayOf(topRight))?.version ?: return null
    return if (first == second) first else null
}

/**
 * The errors a block of this symbol may have had corrected: half of its check
 * codewords once the p of Table 9 is withheld to catch a misdecode. Only
 * versions 1 to 3 withhold any; Reed-Solomon alone would correct one more at
 * 1-L, 1-M and 2-L.
 */
internal fun correctable(version: Int, ecc: ErrorCorrection): Int {
    val p = when {
        version == 1 -> when (ecc) {
            ErrorCorrection.L -> 3
            ErrorCorrection.M -> 2
            else -> 1
        }
        version == 2 && ecc == ErrorCorrection.L -> 2
        version == 3 && ecc == ErrorCorrection.L -> 1
        else -> 0
    }
    return (blocksFor(version, ecc)[0] - p) / 2
}

/**
 * Decodes a symbol from its modules. [size] must be 17 + 4v. From version 7
 * a version block that decodes decides, and a size that disagrees fails;
 * if neither decodes, the size decides. Returns null when the symbol
 * cannot be read.
 */
internal fun readSymbol(read: ModuleReader, size: Int): Payload? {
    if (size < 21 || size > 177 || (size - 17) % 4 != 0) return null
    // When neither version copy decodes, the size says which version it is.
    val version = readVersion(read, size) ?: ((size - 17) / 4)
    if (17 + 4 * version != size) return null

    var first = 0
    var second = 0
    for (i in 14 downTo 0) {
        val x = FORMAT_COORDS[i][0]
        val y = FORMAT_COORDS[i][1]
        first = (first shl 1) or (if (read.read(x, y)) 1 else 0)
        second = (second shl 1) or
            (if (read.read(if (i < 8) size - 1 - i else 8, if (i < 8) 8 else size - 7 + (i - 8))) 1 else 0)
    }
    val format = nearest(FORMATS, { it.bits }, intArrayOf(first, second)) ?: return null

    val blocksInfo = blocksFor(version, format.ecc)
    val ecPerBlock = blocksInfo[0]
    val g1 = blocksInfo[1]
    val d1 = blocksInfo[2]
    val g2 = blocksInfo[3]
    val blockCount = g1 + g2
    val dataCount = g1 * d1 + g2 * (d1 + 1)
    val places = placement(version)
    fun word(index: Int): Int {
        var value = 0
        for (bit in index * 8 until minOf((index + 1) * 8, places.size)) {
            val x = places[bit] and 255
            val y = places[bit] shr 8
            if (read.read(x, y) != maskBit(format.mask, x, y)) value = value or (0x80 ushr (bit and 7))
        }
        return value
    }
    // Read interleaved blocks on demand: a failed block rejects the symbol,
    // so later blocks need neither sampling nor allocating.
    val data = IntArray(dataCount)
    var corrected = 0
    var offset = 0
    val limit = correctable(version, format.ecc)
    for (b in 0 until blockCount) {
        val length = if (b < g1) d1 else d1 + 1
        val block = IntArray(length + ecPerBlock)
        for (i in 0 until d1) block[i] = word(i * blockCount + b)
        if (b >= g1) block[d1] = word(d1 * blockCount + b - g1)
        for (i in 0 until ecPerBlock) block[length + i] = word(dataCount + i * blockCount + b)
        val fixed = correct(block, ecPerBlock)
        if (fixed < 0 || fixed > limit) return null
        corrected += fixed
        System.arraycopy(block, 0, data, offset, length)
        offset += length
    }

    // Zero in every data codeword is what a texture matching the mask pattern
    // corrects to, and it parses as a terminator: no symbol holds it.
    if (data.all { it == 0 }) return null

    val parsed = parse(data, version) ?: return null
    return Payload(parsed.text, parsed.bytes, version, format.ecc, format.mask, parsed.eci, corrected, parsed.structuredAppend, parsed.fnc1)
}

/** Thrown inside [parse] when the bit stream ends early; never leaves this file. */
private class RanOff : RuntimeException("Ran off the end of the data", null, false, false)

private class Bits(private val data: IntArray) {
    private var position = 0

    val available: Int get() = data.size * 8 - position

    fun read(count: Int): Int {
        if (count > available) throw RanOff()
        var value = 0
        for (i in 0 until count) {
            value = (value shl 1) or ((data[position ushr 3] ushr (7 - (position and 7))) and 1)
            position++
        }
        return value
    }
}

private class Run(val eci: Int?, val fixed: String? = null) {
    val bytes = ArrayList<Int>()
}

private class Parsed(
    val text: String,
    val bytes: ByteArray,
    val eci: List<Int>,
    val structuredAppend: StructuredAppend?,
    val fnc1: Fnc1?,
)

/** ISO 18004 7.4.8.3: 0-99 are two digits, ASCII + 100 gives a letter. */
private fun applicationIndicator(value: Int): String? =
    if (value <= 99) value.toString().padStart(2, '0')
    else if (value in 165..190 || value in 197..222) (value - 100).toChar().toString()
    else null

private val KANJI_COUNT_BITS = intArrayOf(8, 10, 12)
private val NUMERIC_COUNT_BITS = intArrayOf(10, 12, 14)
private val ALPHANUMERIC_COUNT_BITS = intArrayOf(9, 11, 13)
private val BYTE_COUNT_BITS = intArrayOf(8, 16, 16)

private fun parse(data: IntArray, version: Int): Parsed? {
    val bits = Bits(data)
    val band = countBand(version)
    val runs = ArrayList<Run>()
    runs.add(Run(null))
    val eci = ArrayList<Int>()
    val out = ArrayList<Int>()
    var structuredAppend: StructuredAppend? = null
    var fnc1: Fnc1? = null
    fun emit(byte: Int) {
        runs[runs.size - 1].bytes.add(byte)
        out.add(byte)
    }
    try {
        while (bits.available >= 4) {
            val mode = bits.read(4)
            if (mode == 0) break
            if (mode == 1) {
                var count = bits.read(NUMERIC_COUNT_BITS[band])
                while (count >= 3) {
                    val v = bits.read(10)
                    if (v > 999) return null
                    for (c in v.toString().padStart(3, '0')) emit(c.code)
                    count -= 3
                }
                if (count > 0) {
                    val v = bits.read(if (count == 2) 7 else 4)
                    if (v >= (if (count == 2) 100 else 10)) return null
                    for (c in v.toString().padStart(count, '0')) emit(c.code)
                }
            } else if (mode == 2) {
                var count = bits.read(ALPHANUMERIC_COUNT_BITS[band])
                val segment = ArrayList<Int>()
                while (count >= 2) {
                    val v = bits.read(11)
                    if (v >= 45 * 45) return null
                    segment.add(ALPHANUMERIC[v / 45].code)
                    segment.add(ALPHANUMERIC[v % 45].code)
                    count -= 2
                }
                if (count == 1) {
                    val v = bits.read(6)
                    if (v >= 45) return null
                    segment.add(ALPHANUMERIC[v].code)
                }
                // Under FNC1, within one segment: %% is %, and a lone % is the group separator.
                var i = 0
                while (i < segment.size) {
                    if (fnc1 != null && segment[i] == 0x25) {
                        if (i + 1 < segment.size && segment[i + 1] == 0x25) {
                            i++
                        } else {
                            emit(0x1d)
                            i++
                            continue
                        }
                    }
                    emit(segment[i])
                    i++
                }
            } else if (mode == 4) {
                val count = bits.read(BYTE_COUNT_BITS[band])
                for (i in 0 until count) emit(bits.read(8))
            } else if (mode == 8) {
                // Kanji: kept as its Shift_JIS bytes; the text shows U+FFFD for each.
                val count = bits.read(KANJI_COUNT_BITS[band])
                for (i in 0 until count) {
                    val v = bits.read(13)
                    var sjis = ((v / 0xc0) shl 8) or (v % 0xc0)
                    sjis += if (sjis < 0x1f00) 0x8140 else 0xc140
                    out.add(sjis ushr 8)
                    out.add(sjis and 0xff)
                    val before = runs[runs.size - 1].eci
                    runs.add(Run(before, kanjiText(sjis)))
                    runs.add(Run(before))
                }
            } else if (mode == 13) {
                // Hanzi (GB/T 18284): subset 1 is GB2312, kept as its bytes; any other subset, or a
                // value outside the GB2312 rows or on an empty cell, rejects the symbol.
                if (bits.read(4) != 1) return null
                val count = bits.read(KANJI_COUNT_BITS[band])
                for (i in 0 until count) {
                    val v = bits.read(13)
                    val row = v / 0x60
                    val lead = row + (if (row < 0x0a) 0xa1 else 0xa6)
                    val low = v % 0x60 + 0xa1
                    val text = hanziText(lead, low) ?: return null
                    out.add(lead)
                    out.add(low)
                    val before = runs[runs.size - 1].eci
                    runs.add(Run(before, text))
                    runs.add(Run(before))
                }
            } else if (mode == 7) {
                val first = bits.read(8)
                val value =
                    if ((first and 0x80) == 0) first
                    else if ((first and 0xc0) == 0x80) ((first and 0x3f) shl 8) or bits.read(8)
                    else if ((first and 0xe0) == 0xc0) ((first and 0x1f) shl 16) or bits.read(16)
                    else -1
                if (value < 0) return null
                eci.add(value)
                runs.add(Run(value))
            } else if (mode == 3) {
                val sequence = bits.read(8)
                val parity = bits.read(8)
                if (structuredAppend == null) structuredAppend = StructuredAppend(sequence ushr 4, (sequence and 15) + 1, parity)
            } else if (mode == 5) {
                if (fnc1 == null) fnc1 = Fnc1(Fnc1Position.FIRST)
            } else if (mode == 9) {
                val indicator = applicationIndicator(bits.read(8)) ?: return null
                if (fnc1 == null) fnc1 = Fnc1(Fnc1Position.SECOND, indicator)
            } else {
                return null
            }
        }
    } catch (e: RanOff) {
        return null
    }
    val text = StringBuilder()
    for (run in runs) text.append(decodeRun(run))
    return Parsed(text.toString(), ByteArray(out.size) { out[it].toByte() }, eci, structuredAppend, fnc1)
}

/**
 * ECI 26 is UTF-8; 3 and 1 are Latin-1; other assignments the runtime knows
 * (Text.kt) are read as that set. Without an ECI, or where the runtime lacks
 * the set, valid UTF-8 is taken as UTF-8, else Latin-1; with no ECI at all,
 * bytes that look like Shift_JIS (looksShiftJis) are read as that.
 */
private fun decodeRun(run: Run): String {
    if (run.fixed != null) return run.fixed
    val bytes = run.bytes.toIntArray()
    if (run.eci == 3 || run.eci == 1) return latin1(bytes)
    if (run.eci == 26) return fromUtf8(bytes)
    if (run.eci != null && bytes.isNotEmpty()) return fromEci(run.eci, bytes) ?: unread(run.eci, bytes)
    if (isUtf8(bytes)) return fromUtf8(bytes)
    if (run.eci == null && looksShiftJis(bytes)) {
        val text = fromEci(20, bytes)
        if (text != null && !text.contains('�')) return text
    }
    return latin1(bytes)
}

private fun latin1(bytes: IntArray): String {
    val s = StringBuilder()
    for (b in bytes) s.append(b.toChar())
    return s.toString()
}
