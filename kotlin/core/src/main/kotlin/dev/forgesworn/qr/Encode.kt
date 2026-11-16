package dev.forgesworn.qr

import kotlin.math.abs

/** Error correction level: about 7, 15, 25 or 30 per cent of codewords recoverable. */
enum class ErrorCorrection { L, M, Q, H }

/** Data mode of a segment. */
enum class Mode { NUMERIC, ALPHANUMERIC, BYTE }

/**
 * One data segment of a symbol, in stream order.
 *
 * @property count The character count field: characters in numeric and alphanumeric mode, bytes in byte mode.
 */
data class Segment(val mode: Mode, val count: Int)

/**
 * Options for [encode].
 *
 * @property ecc Error correction level. Default [ErrorCorrection.M].
 * @property version Exact version, 1-40, not below [minVersion]. Default: the smallest version, from
 *   [minVersion], that fits.
 * @property minVersion Smallest version to consider when choosing one. Default 1.
 * @property mask Mask pattern, 0-7. Default: the pattern with the lowest penalty score.
 * @property mode Encode the whole text as one segment of this mode. Default for text: the mix of
 *   numeric, alphanumeric and byte segments with the fewest bits (SPEC.md, Mode). Bytes are always
 *   one byte segment.
 * @property eci When the symbol has a byte segment, start the stream with an ECI designator for UTF-8
 *   (assignment 26) so a reader need not guess the encoding. Default false: most readers assume
 *   UTF-8 for byte mode, and the designator costs 12 bits.
 */
data class EncodeOptions(
    val ecc: ErrorCorrection = ErrorCorrection.M,
    val version: Int? = null,
    val minVersion: Int = 1,
    val mask: Int? = null,
    val mode: Mode? = null,
    val eci: Boolean = false,
)

/**
 * An encoded symbol.
 *
 * @property mode The widest mode among [segments]: byte if any is byte, else alphanumeric if any is,
 *   else numeric.
 * @property size Modules per side, 17 + 4 * version. Excludes the quiet zone.
 * @property modules Row-major modules, `size * size` entries, 1 for dark.
 * @property segments The data segments in stream order.
 */
class QrCode(
    val version: Int,
    val ecc: ErrorCorrection,
    val mask: Int,
    val mode: Mode,
    val size: Int,
    val modules: ByteArray,
    val segments: List<Segment> = listOf(),
) {
    /** True if the module at column [x], row [y] is dark; false outside the symbol, as the quiet zone is light. */
    fun isDark(x: Int, y: Int): Boolean = x in 0 until size && y in 0 until size && modules[y * size + x].toInt() == 1

    override fun toString(): String = "QrCode(version=$version, ecc=$ecc, mask=$mask, mode=$mode, size=$size, segments=$segments)"
}

/** Thrown when the data does not fit the requested or any version. */
class QrCapacityError(message: String) : IllegalArgumentException(message)

/** True if the module at column [x], row [y] of [qr] is dark; false outside the symbol. */
fun isDark(qr: QrCode, x: Int, y: Int): Boolean = qr.isDark(x, y)

internal const val ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ \$%*+-./:"
internal val EC_ORDER: Array<ErrorCorrection> = arrayOf(ErrorCorrection.L, ErrorCorrection.M, ErrorCorrection.Q, ErrorCorrection.H)
private val EC_FORMAT_BITS: IntArray = intArrayOf(1, 0, 3, 2) // L, M, Q, H
private val MODES: Array<Mode> = arrayOf(Mode.NUMERIC, Mode.ALPHANUMERIC, Mode.BYTE)
private fun modeBits(mode: Mode): Int = when (mode) {
    Mode.NUMERIC -> 1
    Mode.ALPHANUMERIC -> 2
    Mode.BYTE -> 4
}

private fun countBitsFor(mode: Mode, band: Int): Int = when (mode) {
    Mode.NUMERIC -> intArrayOf(10, 12, 14)[band]
    Mode.ALPHANUMERIC -> intArrayOf(9, 11, 13)[band]
    Mode.BYTE -> intArrayOf(8, 16, 16)[band]
}

private const val ECI_MODE = 7
private const val ECI_UTF8 = 26

/** Encodes text (as UTF-8 in byte segments) as one QR code. */
fun encode(text: String, options: EncodeOptions = EncodeOptions()): QrCode = encodeData(text, null, options)

/** Encodes bytes, always as one byte segment, as one QR code. */
fun encode(data: ByteArray, options: EncodeOptions = EncodeOptions()): QrCode = encodeData(null, data, options)

/** One segment's data: the characters in numeric and alphanumeric mode, the bytes in byte mode. */
private class Part(val mode: Mode, val text: String?, val bytes: ByteArray?) {
    val count: Int get() = text?.length ?: bytes!!.size
}

private fun encodeData(text: String?, bytes: ByteArray?, options: EncodeOptions): QrCode {
    val ecc = options.ecc
    val mask = options.mask
    if (mask != null && !(mask in 0..7)) {
        throw IllegalArgumentException("Mask must be an integer from 0 to 7")
    }
    val fixedVersion = options.version
    if (fixedVersion != null && !validVersion(fixedVersion)) {
        throw IllegalArgumentException("Version must be an integer from 1 to 40")
    }
    val minVersion = options.minVersion
    if (!validVersion(minVersion)) throw IllegalArgumentException("minVersion must be an integer from 1 to 40")
    if (fixedVersion != null && fixedVersion < minVersion) throw IllegalArgumentException("Version is below minVersion")

    if (text == null && options.mode != null && options.mode != Mode.BYTE) {
        throw IllegalArgumentException("Bytes can only be encoded in byte mode")
    }
    // Input no version can hold is refused before anything is built from it.
    val length = text?.length ?: bytes!!.size
    if (length > maxInput(text == null, options.mode, ecc, fixedVersion ?: 40)) {
        throw QrCapacityError(
            if (fixedVersion == null) "Data does not fit any version at level $ecc"
            else "Data does not fit version $fixedVersion at level $ecc",
        )
    }

    // One segment for bytes or a named mode; otherwise the cheapest mix, which
    // depends on the count field band, so it is worked out per band as needed.
    val single = singlePart(text, bytes, options.mode)
    val analysed = if (single == null) analyse(text!!) else null
    val plans = arrayOfNulls<List<Part>>(3)
    fun plan(version: Int): List<Part> {
        val band = countBand(version)
        return plans[band] ?: (if (analysed == null) listOf(single!!) else optimalParts(analysed, band)).also { plans[band] = it }
    }
    fun fits(version: Int): Boolean {
        val capacity = dataCodewords(version, ecc) * 8
        // The data bits with each character in its cheapest mode bound every segmentation from below.
        if (analysed != null && analysed.floor > capacity) return false
        return streamLength(plan(version), version, options.eci) <= capacity
    }

    var version = 0
    if (fixedVersion != null) {
        if (!fits(fixedVersion)) throw QrCapacityError("Data does not fit version $fixedVersion at level $ecc")
        version = fixedVersion
    } else {
        for (v in minVersion..40) {
            if (fits(v)) {
                version = v
                break
            }
        }
        if (version == 0) throw QrCapacityError("Data does not fit any version at level $ecc")
    }

    val parts = plan(version)
    val band = countBand(version)
    val capacity = dataCodewords(version, ecc) * 8
    val bits = ArrayList<Int>(capacity)
    if (options.eci && parts.any { it.mode == Mode.BYTE }) {
        push(bits, ECI_MODE, 4)
        push(bits, ECI_UTF8, 8)
    }
    for (part in parts) {
        push(bits, modeBits(part.mode), 4)
        push(bits, part.count, countBitsFor(part.mode, band))
        appendData(bits, part)
    }
    var t = 0
    while (t < 4 && bits.size < capacity) {
        bits.add(0)
        t++
    }
    while (bits.size % 8 != 0) bits.add(0)
    val codewords = IntArray(capacity / 8)
    var i = 0
    while (i < bits.size) {
        var byte = 0
        for (j in 0 until 8) byte = (byte shl 1) or bits[i + j]
        codewords[i / 8] = byte
        i += 8
    }
    var pad = 0xec
    var k = bits.size / 8
    while (k < codewords.size) {
        codewords[k] = pad
        pad = pad xor (0xec xor 0x11)
        k++
    }

    val stream = interleave(codewords, version, ecc)
    val grid = Grid(version)
    grid.placeData(stream)

    var chosen = mask ?: 0
    val modules: ByteArray
    if (mask == null) {
        var best = Int.MAX_VALUE
        var bestModules = ByteArray(0)
        for (m in 0 until 8) {
            val candidate = grid.render(ecc, m)
            val score = penalty(candidate, grid.size, best)
            if (score < best) {
                best = score
                chosen = m
                bestModules = candidate
            }
        }
        modules = bestModules
    } else {
        modules = grid.render(ecc, chosen)
    }
    val mode = MODES[parts.maxOf { it.mode.ordinal }]
    return QrCode(version, ecc, chosen, mode, grid.size, modules, parts.map { Segment(it.mode, it.count) })
}

private fun validVersion(v: Int): Boolean = v in 1..40

internal fun countBand(version: Int): Int = if (version <= 9) 0 else if (version <= 26) 1 else 2

/**
 * The most bytes (for bytes) or UTF-16 code units (for text) that any version
 * up to [highest] can hold at level [ecc]; longer input cannot fit, whatever
 * its characters. Only a lower bound on the bits is used, so nothing that
 * fits is refused (SPEC.md, Version and level):
 *
 * - After the 4-bit mode indicator and a count field, a byte costs 8 bits, a
 *   digit at least 10/3, an alphanumeric character 5.5. A text character that
 *   needs more than one UTF-16 code unit or UTF-8 byte costs more than that
 *   per unit, so units and bytes bound the characters from above.
 * - The count field is taken at the highest version's band, and the capacity
 *   at the highest version. Capacity grows by at least 6 codewords (48 bits)
 *   a version and the count field by at most 8 bits across the bands (byte
 *   mode, 8 to 16), so what fits at a lower version fits within the bound
 *   for the highest.
 * - Text with no named mode is bounded at the cheapest mode and the
 *   narrowest count field, 10/3 bits a unit.
 */
private fun maxInput(isBytes: Boolean, requested: Mode?, ecc: ErrorCorrection, highest: Int): Int {
    val available = dataCodewords(highest, ecc) * 8 - 4
    val band = countBand(highest)
    return when (if (isBytes) Mode.BYTE else requested) {
        Mode.BYTE -> (available - countBitsFor(Mode.BYTE, band)) / 8
        Mode.NUMERIC -> (available - countBitsFor(Mode.NUMERIC, band)) * 3 / 10
        Mode.ALPHANUMERIC -> (available - countBitsFor(Mode.ALPHANUMERIC, band)) * 2 / 11
        null -> (available - MODES.minOf { countBitsFor(it, band) }) * 3 / 10
    }
}

/** The one segment for bytes, a named mode or empty text; null when the encoder chooses a mix. */
private fun singlePart(text: String?, bytes: ByteArray?, requested: Mode?): Part? {
    if (text == null) return Part(Mode.BYTE, null, bytes!!)
    if (requested == Mode.NUMERIC) {
        for (c in text) if (c < '0' || c > '9') throw IllegalArgumentException("Numeric mode takes digits only")
        return Part(Mode.NUMERIC, text, null)
    }
    if (requested == Mode.ALPHANUMERIC) {
        for (c in text) if (ALPHANUMERIC.indexOf(c) < 0) throw IllegalArgumentException("Not in the alphanumeric set: $c")
        return Part(Mode.ALPHANUMERIC, text, null)
    }
    if (requested == Mode.BYTE || text.isEmpty()) return Part(Mode.BYTE, null, utf8(text))
    return null
}

/** Bits before the terminator: one ECI designator if asked for and any segment is byte, then each segment. */
private fun streamLength(parts: List<Part>, version: Int, eci: Boolean): Int {
    val band = countBand(version)
    var total = if (eci && parts.any { it.mode == Mode.BYTE }) 12 else 0
    for (part in parts) {
        val countBits = countBitsFor(part.mode, band)
        if (part.count >= (1 shl countBits)) return Int.MAX_VALUE
        total += 4 + countBits + dataLength(part.mode, part.count)
    }
    return total
}

private fun dataLength(mode: Mode, n: Int): Int = when (mode) {
    Mode.NUMERIC -> n / 3 * 10 + intArrayOf(0, 4, 7)[n % 3]
    Mode.ALPHANUMERIC -> n / 2 * 11 + n % 2 * 6
    Mode.BYTE -> n * 8
}

private fun appendData(bits: MutableList<Int>, part: Part) {
    if (part.mode == Mode.BYTE) {
        for (b in part.bytes!!) push(bits, b.toInt() and 0xff, 8)
        return
    }
    val t = part.text!!
    if (part.mode == Mode.NUMERIC) {
        var i = 0
        while (i < t.length) {
            val group = t.substring(i, minOf(i + 3, t.length))
            push(bits, group.toInt(), group.length * 3 + 1)
            i += 3
        }
    } else {
        var i = 0
        while (i < t.length) {
            val a = ALPHANUMERIC.indexOf(t[i])
            if (i + 1 < t.length) push(bits, a * 45 + ALPHANUMERIC.indexOf(t[i + 1]), 11)
            else push(bits, a, 6)
            i += 2
        }
    }
}

// Optimal segmentation (SPEC.md, Mode). The state before a character is the
// open segment: 0 none, 1-3 numeric holding 3k, 3k+1 or 3k+2 digits, 4-5
// alphanumeric holding an even or odd count, 6 byte. Costs are whole bits, so
// totals and ties are exact. A backward pass gives each state's least
// (bits, segments) to the end; the forward walk takes the first mode, in the
// order numeric, alphanumeric, byte, that keeps that least.
private val STATE_MODE = intArrayOf(-1, 0, 0, 0, 1, 1, 2)

/** Bits for one more character in each state's segment (per UTF-8 byte in byte mode), and the state after it. */
private val STEP_BITS = intArrayOf(0, 4, 3, 3, 6, 5, 8)
private val STEP_NEXT = intArrayOf(0, 2, 3, 1, 5, 4, 6)

/** The state whose step a new segment's first character takes, per mode. */
private val OPENING = intArrayOf(1, 4, 6)

/**
 * Text ready for segmentation: code points, their kinds (0 digit, 1 other alphanumeric, 2 anything
 * else) and UTF-8 lengths, and [floor], the data bits with each character in its cheapest mode and
 * no headers, a lower bound for every segmentation.
 */
private class Analysed(val cps: IntArray, val kinds: IntArray, val lengths: IntArray, val floor: Double)

private fun analyse(text: String): Analysed {
    // Over 16384 code units is over 8192 characters, more than any symbol holds.
    if (text.length > 16384) return Analysed(IntArray(0), IntArray(0), IntArray(0), Double.POSITIVE_INFINITY)
    val cps = codePoints(text)
    val kinds = IntArray(cps.size) {
        val cp = cps[it]
        if (cp in 0x30..0x39) 0 else if (cp < 0x80 && ALPHANUMERIC.indexOf(cp.toChar()) >= 0) 1 else 2
    }
    val lengths = IntArray(cps.size) {
        val cp = cps[it]
        if (cp < 0x80) 1 else if (cp < 0x800) 2 else if (cp < 0x10000) 3 else 4
    }
    var floor = 0.0
    for (i in cps.indices) floor += if (kinds[i] == 0) 10.0 / 3 else if (kinds[i] == 1) 5.5 else 8.0 * lengths[i]
    return Analysed(cps, kinds, lengths, floor)
}

/** The segments with the fewest bits at this band, with SPEC.md's tie-breaks. */
private fun optimalParts(t: Analysed, band: Int): List<Part> {
    val n = t.cps.size
    val head = IntArray(3) { 4 + countBitsFor(MODES[it], band) }
    // Cost to the end from each (position, state), as bits * 8192 + segments.
    // Fewer than 8192 segments: text past the floor check has under 7100 characters.
    val cost = LongArray((n + 1) * 7)
    fun via(i: Int, s: Int, m: Int): Long {
        val open = STATE_MODE[s] != m
        val st = if (open) OPENING[m] else s
        val bits = STEP_BITS[st] * (if (m == 2) t.lengths[i] else 1) + (if (open) head[m] else 0)
        return bits.toLong() * 8192 + (if (open) 1 else 0) + cost[(i + 1) * 7 + STEP_NEXT[st]]
    }
    for (i in n - 1 downTo 0) {
        for (s in 0 until 7) {
            var best = Long.MAX_VALUE
            for (m in t.kinds[i] until 3) best = minOf(best, via(i, s, m))
            cost[i * 7 + s] = best
        }
    }
    val parts = ArrayList<Part>()
    fun close(start: Int, end: Int, m: Int) {
        val slice = t.cps.copyOfRange(start, end)
        parts.add(if (m == 2) Part(Mode.BYTE, null, encodeUtf8(slice)) else Part(MODES[m], String(slice, 0, slice.size), null))
    }
    var state = 0
    var start = 0
    for (i in 0 until n) {
        var m = t.kinds[i]
        while (via(i, state, m) != cost[i * 7 + state]) m++
        val open = STATE_MODE[state] != m
        if (open) {
            if (i > 0) close(start, i, STATE_MODE[state])
            start = i
        }
        state = STEP_NEXT[if (open) OPENING[m] else state]
    }
    close(start, n, STATE_MODE[state])
    return parts
}

/** Code points of [text], with lone surrogates as U+FFFD (as JavaScript's TextEncoder does). */
private fun codePoints(text: String): IntArray {
    val out = IntArray(text.length)
    var n = 0
    var i = 0
    while (i < text.length) {
        var c = text[i].code
        if (c in 0xd800..0xdbff && i + 1 < text.length) {
            val d = text[i + 1].code
            if (d in 0xdc00..0xdfff) {
                c = 0x10000 + ((c - 0xd800) shl 10) + (d - 0xdc00)
                i++
            }
        }
        out[n++] = if (c in 0xd800..0xdfff) 0xfffd else c
        i++
    }
    return out.copyOf(n)
}

/** UTF-8 bytes of [text], with lone surrogates as U+FFFD (as JavaScript's TextEncoder does). */
internal fun utf8(text: String): ByteArray = encodeUtf8(codePoints(text))

private fun encodeUtf8(cps: IntArray): ByteArray {
    val out = ArrayList<Byte>(cps.size)
    for (c in cps) {
        if (c < 0x80) {
            out.add(c.toByte())
        } else if (c < 0x800) {
            out.add((0xc0 or (c shr 6)).toByte())
            out.add((0x80 or (c and 63)).toByte())
        } else if (c < 0x10000) {
            out.add((0xe0 or (c shr 12)).toByte())
            out.add((0x80 or ((c shr 6) and 63)).toByte())
            out.add((0x80 or (c and 63)).toByte())
        } else {
            out.add((0xf0 or (c shr 18)).toByte())
            out.add((0x80 or ((c shr 12) and 63)).toByte())
            out.add((0x80 or ((c shr 6) and 63)).toByte())
            out.add((0x80 or (c and 63)).toByte())
        }
    }
    return out.toByteArray()
}

/** [EC codewords per block, group 1 blocks, group 1 data codewords per block, group 2 blocks]. */
internal fun blocksFor(version: Int, ecc: ErrorCorrection): IntArray = EC_BLOCKS[version - 1][EC_ORDER.indexOf(ecc)]

private fun dataCodewords(version: Int, ecc: ErrorCorrection): Int {
    val b = blocksFor(version, ecc)
    return b[1] * b[2] + b[3] * (b[2] + 1)
}

private fun push(bits: MutableList<Int>, value: Int, length: Int) {
    for (i in length - 1 downTo 0) bits.add((value ushr i) and 1)
}

// Reed-Solomon over GF(256), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1.
internal val EXP = IntArray(512)
internal val LOG = IntArray(256)

@Suppress("unused")
private val gfReady: Boolean = run {
    var x = 1
    for (i in 0 until 255) {
        EXP[i] = x
        LOG[x] = i
        x = x shl 1
        if (x and 0x100 != 0) x = x xor 0x11d
    }
    for (i in 255 until 512) EXP[i] = EXP[i - 255]
    true
}

internal fun gfMul(a: Int, b: Int): Int {
    return if (a == 0 || b == 0) 0 else EXP[LOG[a] + LOG[b]]
}

private val generators = HashMap<Int, IntArray>()

/** Monic generator polynomial of the given degree, highest coefficient first. */
private fun generator(degree: Int): IntArray {
    generators[degree]?.let { return it }
    var poly = intArrayOf(1)
    for (i in 0 until degree) {
        val next = IntArray(poly.size + 1)
        for (j in poly.indices) {
            next[j] = next[j] xor poly[j]
            next[j + 1] = next[j + 1] xor gfMul(poly[j], EXP[i])
        }
        poly = next
    }
    generators[degree] = poly
    return poly
}

/** Check codewords of [data] (values 0..255) for a block with [degree] check codewords. */
private fun remainder(data: IntArray, degree: Int): IntArray {
    val gen = generator(degree)
    val out = IntArray(degree)
    for (byte in data) {
        val factor = byte xor out[0]
        System.arraycopy(out, 1, out, 0, degree - 1)
        out[degree - 1] = 0
        for (i in 0 until degree) out[i] = out[i] xor gfMul(gen[i + 1], factor)
    }
    return out
}

private fun interleave(codewords: IntArray, version: Int, ecc: ErrorCorrection): IntArray {
    val b = blocksFor(version, ecc)
    val ecPerBlock = b[0]
    val g1 = b[1]
    val d1 = b[2]
    val g2 = b[3]
    val data = ArrayList<IntArray>()
    val checks = ArrayList<IntArray>()
    var offset = 0
    for (blk in 0 until g1 + g2) {
        val length = if (blk < g1) d1 else d1 + 1
        val block = codewords.copyOfRange(offset, offset + length)
        offset += length
        data.add(block)
        checks.add(remainder(block, ecPerBlock))
    }
    val out = IntArray(codewords.size + (g1 + g2) * ecPerBlock)
    var k = 0
    for (i in 0..d1) for (block in data) if (i < block.size) out[k++] = block[i]
    for (i in 0 until ecPerBlock) for (block in checks) out[k++] = block[i]
    return out
}

/** Format information coordinates (x, y) for bits 0 to 14, beside the top-left finder. */
internal val FORMAT_COORDS: Array<IntArray> = arrayOf(
    intArrayOf(8, 0), intArrayOf(8, 1), intArrayOf(8, 2), intArrayOf(8, 3), intArrayOf(8, 4), intArrayOf(8, 5),
    intArrayOf(8, 7), intArrayOf(8, 8), intArrayOf(7, 8), intArrayOf(5, 8), intArrayOf(4, 8), intArrayOf(3, 8),
    intArrayOf(2, 8), intArrayOf(1, 8), intArrayOf(0, 8),
)

internal class Grid(private val version: Int) {
    val size: Int = 17 + 4 * version
    private val base = ByteArray(size * size)
    private val reserved = ByteArray(size * size)

    init {
        val s = size
        finder(0, 0)
        finder(s - 7, 0)
        finder(0, s - 7)
        fn(8, s - 8, 1)
        val centres = ALIGNMENT_CENTRES[version - 1]
        for (cy in centres) {
            for (cx in centres) {
                if (reserved[cy * s + cx].toInt() != 0) continue
                for (dy in -2..2) {
                    for (dx in -2..2) {
                        fn(cx + dx, cy + dy, if (maxOf(abs(dx), abs(dy)) != 1) 1 else 0)
                    }
                }
            }
        }
        for (i in 8 until s - 8) {
            if (reserved[6 * s + i].toInt() == 0) fn(i, 6, if (i % 2 == 0) 1 else 0)
            if (reserved[i * s + 6].toInt() == 0) fn(6, i, if (i % 2 == 0) 1 else 0)
        }
        for (i in 0 until 15) {
            val x = FORMAT_COORDS[i][0]
            val y = FORMAT_COORDS[i][1]
            fn(x, y, 0)
            if (i < 8) fn(s - 1 - i, 8, 0)
            else fn(8, s - 7 + (i - 8), 0)
        }
        if (version >= 7) {
            for (i in 0 until 6) {
                for (j in 0 until 3) {
                    fn(i, s - 11 + j, 0)
                    fn(s - 11 + j, i, 0)
                }
            }
        }
    }

    /** True for finder, separator, timing, alignment, format and version modules. */
    fun isReserved(x: Int, y: Int): Boolean = reserved[y * size + x].toInt() == 1

    private fun fn(x: Int, y: Int, dark: Int) {
        base[y * size + x] = dark.toByte()
        reserved[y * size + x] = 1
    }

    private fun finder(left: Int, top: Int) {
        for (dy in -1..7) {
            for (dx in -1..7) {
                val x = left + dx
                val y = top + dy
                if (x < 0 || y < 0 || x >= size || y >= size) continue
                val ring = maxOf(abs(dx - 3), abs(dy - 3))
                fn(x, y, if (ring != 2 && ring != 4) 1 else 0)
            }
        }
    }

    /** Zigzag placement of the final codeword stream; remainder bits are light. */
    fun placeData(stream: IntArray) {
        val s = size
        val total = stream.size * 8
        var bit = 0
        var upward = true
        var right = s - 1
        while (right >= 1) {
            if (right == 6) right = 5
            for (step in 0 until s) {
                val y = if (upward) s - 1 - step else step
                for (i in 0 until 2) {
                    val x = right - i
                    if (reserved[y * s + x].toInt() != 0) continue
                    if (bit < total) base[y * s + x] = ((stream[bit ushr 3] ushr (7 - (bit and 7))) and 1).toByte()
                    bit++
                }
            }
            upward = !upward
            right -= 2
        }
    }

    /** A copy with the data masked and the format and version information drawn. */
    fun render(ecc: ErrorCorrection, mask: Int): ByteArray {
        val s = size
        val out = base.copyOf()
        for (y in 0 until s) {
            for (x in 0 until s) {
                if (reserved[y * s + x].toInt() == 0 && maskBit(mask, x, y)) out[y * s + x] = (out[y * s + x].toInt() xor 1).toByte()
            }
        }
        val format = formatBits(ecc, mask)
        for (i in 0 until 15) {
            val bit = ((format ushr i) and 1).toByte()
            val x = FORMAT_COORDS[i][0]
            val y = FORMAT_COORDS[i][1]
            out[y * s + x] = bit
            if (i < 8) out[8 * s + (s - 1 - i)] = bit
            else out[(s - 7 + (i - 8)) * s + 8] = bit
        }
        if (version >= 7) {
            val info = versionBits(version)
            for (k in 0 until 18) {
                val bit = ((info ushr k) and 1).toByte()
                val i = k / 3
                val j = k % 3
                out[(s - 11 + j) * s + i] = bit
                out[i * s + (s - 11 + j)] = bit
            }
        }
        return out
    }
}

internal fun maskBit(mask: Int, x: Int, y: Int): Boolean = when (mask) {
    0 -> (x + y) % 2 == 0
    1 -> y % 2 == 0
    2 -> x % 3 == 0
    3 -> (x + y) % 3 == 0
    4 -> (y / 2 + x / 3) % 2 == 0
    5 -> ((x * y) % 2) + ((x * y) % 3) == 0
    6 -> (((x * y) % 2) + ((x * y) % 3)) % 2 == 0
    else -> (((x + y) % 2) + ((x * y) % 3)) % 2 == 0
}

internal fun formatBits(ecc: ErrorCorrection, mask: Int): Int {
    val data = (EC_FORMAT_BITS[ecc.ordinal] shl 3) or mask
    var rem = data
    for (i in 0 until 10) rem = (rem shl 1) xor ((rem ushr 9) * 0x537)
    return ((data shl 10) or rem) xor 0x5412
}

internal fun versionBits(version: Int): Int {
    var rem = version
    for (i in 0 until 12) rem = (rem shl 1) xor ((rem ushr 11) * 0x1f25)
    return (version shl 12) or rem
}

/** Mask penalty per ISO/IEC 18004 section 7.8.3, scoring the finished symbol. */
internal fun penalty(modules: ByteArray, size: Int, limit: Int = Int.MAX_VALUE): Int {
    var score = 0
    var dark = 0
    for (y in 0 until size) {
        var rowRun = 0
        var colRun = 0
        var rowBits = 0
        var colBits = 0
        for (x in 0 until size) {
            val here = modules[y * size + x]
            dark += here
            if (x > 0 && here == modules[y * size + x - 1]) rowRun++
            else {
                if (rowRun >= 5) score += rowRun - 2
                rowRun = 1
            }
            val down = modules[x * size + y]
            if (x > 0 && down == modules[(x - 1) * size + y]) colRun++
            else {
                if (colRun >= 5) score += colRun - 2
                colRun = 1
            }
            if (x < size - 1 && y < size - 1) {
                if (here == modules[y * size + x + 1] &&
                    here == modules[(y + 1) * size + x] &&
                    here == modules[(y + 1) * size + x + 1]
                ) score += 3
            }
            rowBits = (rowBits shl 1) or here.toInt()
            colBits = (colBits shl 1) or down.toInt()
            // Count each finder-like core once, even with quiet runs on both sides.
            if (x >= 10) {
                if ((rowBits and 0x7ff) == 0x05d) score += 40
                if ((colBits and 0x7ff) == 0x05d) score += 40
                if ((rowBits and 0x7ff) == 0x5d0 && (x < 14 || (rowBits and 0x7800) != 0)) score += 40
                if ((colBits and 0x7ff) == 0x5d0 && (x < 14 || (colBits and 0x7800) != 0)) score += 40
            }
        }
        if (rowRun >= 5) score += rowRun - 2
        if (colRun >= 5) score += colRun - 2
        // Every remaining penalty is non-negative; ties keep the earlier mask.
        if (score >= limit) return score
    }
    val total = size * size
    score += (abs(dark * 2 - total) * 10 / total) * 10
    return score
}
