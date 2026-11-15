package dev.forgesworn.qr

import kotlin.math.floor

/** Which way round to look for dark modules. */
enum class Inversion {
    /** Dark modules on a light ground only. */
    NORMAL,

    /** Light modules on a dark ground only. */
    INVERTED,

    /** Dark on light first, then light on dark. */
    BOTH,
}

/** Picture coordinates of the finder pattern centres, and of the alignment pattern if one was used. */
class QrLocation(
    val topLeft: Point,
    val topRight: Point,
    val bottomLeft: Point,
    val alignment: Point?,
) {
    override fun toString(): String = "QrLocation(topLeft=$topLeft, topRight=$topRight, bottomLeft=$bottomLeft, alignment=$alignment)"
}

/**
 * A symbol read from a picture or a module grid.
 *
 * @property text The decoded text: UTF-8 when it is valid UTF-8, else Latin-1, unless an ECI says.
 * @property bytes The payload as bytes: byte-mode data as stored, numeric and alphanumeric as ASCII.
 * @property eci ECI assignment numbers in the order they appeared; empty if none.
 * @property corrected Codewords Reed-Solomon had to correct.
 * @property mirrored The symbol was mirrored (read transposed).
 * @property inverted The symbol was light on dark.
 * @property location Where the code sits in the picture; null when read from a module grid.
 * @property structuredAppend Set when the symbol is one of a structured-append set; [text] and [bytes] then hold this symbol's part only.
 * @property fnc1 Set when the symbol carries an FNC1 indicator; see [Fnc1].
 */
class DecodeResult internal constructor(
    val text: String,
    val bytes: ByteArray,
    val version: Int,
    val ecc: ErrorCorrection,
    val mask: Int,
    val eci: List<Int>,
    val corrected: Int,
    val mirrored: Boolean,
    val inverted: Boolean,
    val location: QrLocation?,
    val structuredAppend: StructuredAppend? = null,
    val fnc1: Fnc1? = null,
) {
    override fun toString(): String =
        "DecodeResult(text=$text, version=$version, ecc=$ecc, mask=$mask, eci=$eci, corrected=$corrected, " +
            "mirrored=$mirrored, inverted=$inverted)"
}

private const val MAX_TRIPLES = 6
private fun check(width: Int, height: Int, rowStride: Int, length: Int) {
    if (width < 1 || height < 1) throw IllegalArgumentException("Width and height must be positive integers")
    if (rowStride < width) throw IllegalArgumentException("rowStride must be an integer of at least width")
    val last = rowStride.toLong() * (height - 1) + width
    if (length < last) throw IllegalArgumentException("The data is too short for a ${width}x$height picture")
}

/**
 * Finds and reads one QR code in a greyscale picture: a Y plane, one byte a
 * pixel, 0 black to 255 white, as a camera's luminance plane gives. [rowStride]
 * is the number of bytes from the start of one row to the next, for padded
 * camera planes. Returns null when no readable code is found.
 */
fun decode(
    luminance: ByteArray,
    width: Int,
    height: Int,
    rowStride: Int = width,
    inversion: Inversion = Inversion.BOTH,
): DecodeResult? {
    check(width, height, rowStride, luminance.size)
    return decodeLuminance(toLuminance(luminance, width, height, rowStride), inversion)
}

/**
 * As [decode], for packed ARGB pixels (the layout of Android's `Bitmap.getPixels`).
 * Transparent pixels count as white, so a code drawn on a transparent canvas
 * still reads. [rowStride] is in pixels.
 */
fun decode(
    argb: IntArray,
    width: Int,
    height: Int,
    rowStride: Int = width,
    inversion: Inversion = Inversion.BOTH,
): DecodeResult? {
    check(width, height, rowStride, argb.size)
    return decodeLuminance(toLuminance(argb, width, height, rowStride), inversion)
}

/** As [decode] for a greyscale picture, counting the search's work into [work]; for tests. */
internal fun decodeCounted(luminance: ByteArray, width: Int, height: Int, work: Work): DecodeResult? {
    check(width, height, width, luminance.size)
    return decodeLuminance(toLuminance(luminance, width, height, width), Inversion.BOTH, work)
}

private fun decodeLuminance(luminance: Luminance, inversion: Inversion, work: Work? = null): DecodeResult? {
    val bits = binarise(luminance)
    val candidates = ArrayList<Retry>(SECOND_LOOKS + 1)
    if (inversion != Inversion.INVERTED) {
        val found = search(bits, false, candidates, work)
        if (found != null) return found
    }
    if (inversion != Inversion.NORMAL) {
        val found = search(invert(bits), true, candidates, work)
        if (found != null) return found
    }
    // Nothing read: look again at the few maps whose format copies agreed.
    if (candidates.isEmpty()) return null
    val levels = thresholds(luminance)
    for (candidate in candidates) {
        if (work != null) work.second++
        val p = secondLook(luminance, levels, candidate, work) ?: continue
        return result(p, mirrored = candidate.agreed.mirrored, inverted = candidate.inverted, location = where(candidate.location))
    }
    return null
}

private fun where(location: Placement): QrLocation = QrLocation(location.topLeft, location.topRight, location.bottomLeft, location.alignment)

private fun search(image: BitImage, inverted: Boolean, candidates: MutableList<Retry>, work: Work?): DecodeResult? {
    // A strict pass first; a looser one for blurred or small codes.
    for (tolerance in doubleArrayOf(0.5, 0.8)) {
        val triples = finderTriples(image, findFinders(image, tolerance, work)).take(MAX_TRIPLES)
        for (triple in triples) {
            val first = locate(image, triple, null, work)
            if (first.isEmpty()) continue
            // The size estimate can be a version out; try the neighbours too.
            for (delta in intArrayOf(0, -4, 4, -8, 8)) {
                for (location in if (delta == 0) first else locate(image, triple, first[0].size + delta, work)) {
                    if (work != null) work.maps++
                    val result = read(image, location, inverted, candidates)
                    if (result != null) return result
                }
            }
        }
    }
    return null
}

private fun read(image: BitImage, location: Placement, inverted: Boolean, candidates: MutableList<Retry>): DecodeResult? {
    val size = location.size
    val modules = ByteArray(size * size)
    for (y in 0 until size) {
        for (x in 0 until size) {
            val p = location.project(x, y)
            val px = floor(p.x)
            val py = floor(p.y)
            if (px >= 0 && py >= 0 && px < image.width && py < image.height) {
                modules[y * size + x] = image.data[py.toInt() * image.width + px.toInt()]
            }
        }
    }
    val straight = readSymbol({ x, y -> modules[y * size + x].toInt() == 1 }, size)
    if (straight != null) return result(straight, mirrored = false, inverted = inverted, location = where(location))
    val mirrored = readSymbol({ x, y -> modules[x * size + y].toInt() == 1 }, size)
    if (mirrored != null) return result(mirrored, mirrored = true, inverted = inverted, location = where(location))
    val agreed = agreement(modules, size)
    if (agreed != null) keep(candidates, Retry(location, inverted, agreed))
    return null
}

private fun result(p: Payload, mirrored: Boolean, inverted: Boolean, location: QrLocation?): DecodeResult =
    DecodeResult(
        p.text, p.bytes, p.version, p.ecc, p.mask, p.eci, p.corrected, mirrored, inverted, location,
        p.structuredAppend, p.fnc1,
    )

/**
 * Reads a symbol from its module grid, [size] by [size], row by row, non-zero
 * for dark, with no quiet zone. Mirrored grids read too. The result has no
 * location and is not inverted. Returns null when the symbol cannot be read.
 */
fun decodeModules(modules: ByteArray, size: Int): DecodeResult? {
    if (modules.size.toLong() < size.toLong() * size) throw IllegalArgumentException("Fewer modules than size x size")
    return decodeGrid({ i -> modules[i].toInt() != 0 }, size)
}

/** As [decodeModules], for a grid of booleans (true for dark). */
fun decodeModules(modules: BooleanArray, size: Int): DecodeResult? {
    if (modules.size.toLong() < size.toLong() * size) throw IllegalArgumentException("Fewer modules than size x size")
    return decodeGrid({ i -> modules[i] }, size)
}

private fun decodeGrid(at: (Int) -> Boolean, size: Int): DecodeResult? {
    val straight = readSymbol({ x, y -> at(y * size + x) }, size)
    if (straight != null) return result(straight, mirrored = false, inverted = false, location = null)
    val mirrored = readSymbol({ x, y -> at(x * size + y) }, size)
    return if (mirrored != null) result(mirrored, mirrored = true, inverted = false, location = null) else null
}
