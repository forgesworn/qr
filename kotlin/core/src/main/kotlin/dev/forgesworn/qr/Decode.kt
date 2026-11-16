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

/** Maps sampled a frame, at most, at every size together: four passes, six triples, five sizes, six maps a size. */
private const val MAX_MAPS = 4 * MAX_TRIPLES * 5 * 6

/** The reduced-size pass's factors, coarse to fine. */
private val REDUCTIONS = intArrayOf(8, 4, 2)

/** A reduced picture narrower or shorter than this cannot hold a version 1 symbol at a pixel a module. */
private const val MIN_REDUCED = 21

/** Maps each reduced size may take, out of what the frame has left. */
private const val REDUCED_MAPS = 30

private class VersionHint(val triple: Array<Finder>, val size: Int, val inverted: Boolean)
/** What is left of a frame's maps and second looks, shared by every size, and of the maps this size may take. */
private class Budget(var maps: Int, var second: Int, var here: Int, var invertedFallback: Boolean = false, var uniform: Boolean = false) {
    val hints = ArrayList<VersionHint>(4)
}

private fun decodeLuminance(luminance: Luminance, inversion: Inversion, work: Work? = null): DecodeResult? {
    val budget = Budget(MAX_MAPS, SECOND_LOOKS, MAX_MAPS)
    val found = look(luminance, inversion, 1, budget, work)
    if (found != null) return found
    if (budget.uniform) return null
    // Nothing read at full size: the picture shrunk, coarse to fine, for codes
    // whose modules are large or carry texture or scan lines (decoder step 9).
    val shrunk = Reductions(luminance)
    for (f in REDUCTIONS) {
        if (luminance.width / f < MIN_REDUCED || luminance.height / f < MIN_REDUCED) continue
        // With no maps left no size can read, nor keep a candidate for a second look.
        if (budget.maps == 0) break
        budget.here = REDUCED_MAPS
        val reduced = look(shrunk.by(f), inversion, f, budget, work)
        if (reduced != null) return reduced
    }
    if (inversion != Inversion.NORMAL && budget.maps > 0 && budget.invertedFallback) {
        budget.here = REDUCED_MAPS
        val inverse = invertLuminance(luminance)
        val fallback = look(inverse, Inversion.NORMAL, 1, budget, work, true)
        if (fallback != null) return DecodeResult(
            fallback.text, fallback.bytes, fallback.version, fallback.ecc, fallback.mask, fallback.eci,
            fallback.corrected, fallback.mirrored, true, fallback.location, fallback.structuredAppend, fallback.fnc1,
        )
        val inverseShrunk = Reductions(inverse)
        for (f in REDUCTIONS) {
            if (budget.maps == 0 || budget.here == 0) break
            if (luminance.width / f < MIN_REDUCED || luminance.height / f < MIN_REDUCED) continue
            val reduced = look(inverseShrunk.by(f), Inversion.NORMAL, f, budget, work, true)
            if (reduced != null) return DecodeResult(
                reduced.text, reduced.bytes, reduced.version, reduced.ecc, reduced.mask, reduced.eci,
                reduced.corrected, reduced.mirrored, true, reduced.location, reduced.structuredAppend, reduced.fnc1,
            )
        }
    }
    return recoverVersions(luminance, budget, work)
}

/**
 * The ordinary search in each polarity, then the second look, on a picture
 * shrunk by [f] (1 for the picture itself). At reduced size a read counts
 * only if its format copies agree on its level and mask, and locations are
 * given in full-picture coordinates.
 */
private fun look(luminance: Luminance, inversion: Inversion, f: Int, budget: Budget, work: Work?, strictOverride: Boolean = false): DecodeResult? {
    val levels = thresholds(luminance)
    if (f == 1 && !strictOverride) {
        budget.invertedFallback = levels.invertedFallback
        budget.uniform = levels.uniform
    }
    if (levels.uniform) return null
    val bits = binarise(luminance, levels)
    // The inverse changes colour where the picture does, so one set of edges serves both.
    val edges = Edges(bits)
    val strict = f > 1 || strictOverride
    val candidates = ArrayList<Retry>(SECOND_LOOKS + 1)
    val scratch = ReadScratch()
    if (inversion != Inversion.INVERTED) {
        val found = search(bits, edges, false, candidates, budget, strict, f, work, scratch)
        if (found != null) return found
    }
    if (inversion != Inversion.NORMAL) {
        val found = search(invert(bits), edges, true, candidates, budget, strict, f, work, scratch)
        if (found != null) return found
    }
    // Nothing read: look again at the few maps whose format copies agreed.
    if (candidates.isEmpty() || budget.second == 0) return null
    for (candidate in candidates) {
        if (budget.second == 0) break
        budget.second--
        if (work != null) work.second++
        val p = secondLook(luminance, levels, candidate, work, strict) ?: continue
        return result(p, mirrored = candidate.agreed.mirrored, inverted = candidate.inverted, location = where(candidate.location, f))
    }
    return null
}

/**
 * A location in full-picture coordinates. Picture coordinates are continuous,
 * pixel i covering [i, i + 1), so a point x in a picture shrunk by f lies at x * f.
 */
private fun where(location: Placement, f: Int): QrLocation {
    if (f == 1) return QrLocation(location.topLeft, location.topRight, location.bottomLeft, location.alignment)
    fun up(p: Point): Point = Point(p.x * f, p.y * f)
    return QrLocation(up(location.topLeft), up(location.topRight), up(location.bottomLeft), location.alignment?.let { up(it) })
}

private fun search(
    image: BitImage,
    edges: Edges,
    inverted: Boolean,
    candidates: MutableList<Retry>,
    budget: Budget,
    strict: Boolean,
    f: Int,
    work: Work?,
    scratch: ReadScratch,
): DecodeResult? {
    if (budget.maps == 0 || budget.here == 0) return null
    // A strict pass first; a looser one for blurred or small codes.
    for (tolerance in doubleArrayOf(0.5, 0.8)) {
        val triples = finderTriples(image, findFinders(image, tolerance, work, edges)).take(MAX_TRIPLES)
        for (triple in triples) {
            val first = locate(image, triple, null, work, edges)
            // An estimate past version 40 by no more than the retries reach still
            // tries the sizes of 177 or less among them.
            val size = if (first.isNotEmpty()) first[0].size else over(image, triple) ?: continue
            // The size estimate can be a version out; try the neighbours too.
            for (delta in intArrayOf(0, -4, 4, -8, 8)) {
                for (location in if (delta == 0) first else locate(image, triple, size + delta, work, edges)) {
                    if (budget.maps == 0 || budget.here == 0) return null
                    budget.maps--
                    budget.here--
                    if (work != null) {
                        work.maps++
                        if (f > 1) work.reduced++
                    }
                    val result = read(image, location, inverted, candidates, strict, f, scratch,
                        if (f == 1 && !strict) triple else null, budget)
                    if (result != null) return result
                    if (budget.maps == 0 || budget.here == 0) return null
                }
            }
        }
    }
    return null
}

/** The size estimate when it is past 177 by at most the retries' 8; otherwise null. */
private fun over(image: BitImage, triple: Array<Finder>): Int? {
    val size = estimateSize(image, triple) ?: return null
    return if (size > 177 && size <= 177 + 8) size else null
}

private class ReadScratch {
    var modules = ByteArray(0)
}

private fun read(
    image: BitImage,
    location: Placement,
    inverted: Boolean,
    candidates: MutableList<Retry>,
    strict: Boolean,
    f: Int,
    scratch: ReadScratch,
    triple: Array<Finder>? = null,
    budget: Budget? = null,
): DecodeResult? {
    val size = location.size
    val length = size * size
    if (scratch.modules.size < length) scratch.modules = ByteArray(length)
    val modules = scratch.modules
    modules.fill(2, 0, length) // Unsampled, then 0 for light or 1 for dark.
    val m = location.matrix
    val sample = ModuleReader { x, y ->
        val index = y * size + x
        if (modules[index].toInt() != 2) modules[index].toInt() == 1 else {
            val px: Double
            val py: Double
            if (m != null) {
                val u = x + 0.5
                val v = y + 0.5
                val w = m[6] * u + m[7] * v + m[8]
                px = floor((m[0] * u + m[1] * v + m[2]) / w)
                py = floor((m[3] * u + m[4] * v + m[5]) / w)
            } else {
                val p = location.project(x, y)
                px = floor(p.x)
                py = floor(p.y)
            }
            val value = if (px >= 0 && py >= 0 && px < image.width && py < image.height)
                image.data[py.toInt() * image.width + px.toInt()] else 0
            modules[index] = value
            value.toInt() == 1
        }
    }
    // A strict read needs two agreeing copies in one orientation; sample only
    // those format modules before attempting either full symbol read.
    if (strict && agreementRead(sample, size) == null) return null
    val straightRead = sample
    val straight = readSymbol(straightRead, size)
    if (straight != null) {
        // At reduced size, a read whose format copies do not agree on its level and mask is no read.
        if (strict && !formatAgrees(straightRead, size, straight.ecc, straight.mask)) return null
        return result(straight, mirrored = false, inverted = inverted, location = where(location, f))
    }
    val mirroredRead = ModuleReader { x, y -> sample.read(y, x) }
    val mirrored = readSymbol(mirroredRead, size)
    if (mirrored != null) {
        if (strict && !formatAgrees(mirroredRead, size, mirrored.ecc, mirrored.mask)) return null
        return result(mirrored, mirrored = true, inverted = inverted, location = where(location, f))
    }
    // A version mismatch may have stopped either read before its format.
    for (i in 0 until 15) {
        val x = FORMAT_COORDS[i][0]
        val y = FORMAT_COORDS[i][1]
        sample.read(x, y); sample.read(y, x)
        val sx = if (i < 8) size - 1 - i else 8
        val sy = if (i < 8) 8 else size - 7 + (i - 8)
        sample.read(sx, sy); sample.read(sy, sx)
    }
    val agreed = agreement(modules, size)
    if (agreed != null) {
        // Preserve the existing candidate decision before sampling additional version modules.
        if (sized(modules, size, agreed.mirrored)) keep(candidates, Retry(location, inverted, agreed))
        if (triple != null && budget != null && budget.hints.size < 4) {
            val reader = if (agreed.mirrored) mirroredRead else straightRead
            val version = agreedVersion(reader, size)
            val target = if (version == null) size else 17 + 4 * version
            if (target != size && budget.hints.none { hint ->
                hint.size == target && hint.inverted == inverted &&
                    (0..2).all { hint.triple[it].x == triple[it].x && hint.triple[it].y == triple[it].y }
            }) budget.hints.add(VersionHint(triple, target, inverted))
        }
    }
    return null
}

/** Revisit only full-size triples supported by both version copies, after all ordinary paths. */
private fun recoverVersions(luminance: Luminance, budget: Budget, work: Work?): DecodeResult? {
    if (budget.hints.isEmpty() || budget.maps == 0) return null
    val levels = thresholds(luminance)
    val bits = binarise(luminance, levels)
    val edges = Edges(bits)
    val inverse = if (budget.hints.any { it.inverted }) invert(bits) else bits
    val candidates = ArrayList<Retry>(SECOND_LOOKS + 1)
    val scratch = ReadScratch()
    budget.here = REDUCED_MAPS
    for (hint in budget.hints) {
        if (budget.maps == 0 || budget.here == 0) break
        val image = if (hint.inverted) inverse else bits
        for (location in locate(image, hint.triple, hint.size, work, edges)) {
            if (budget.maps == 0 || budget.here == 0) break
            budget.maps--
            budget.here--
            if (work != null) work.maps++
            val found = read(image, location, hint.inverted, candidates, true, 1, scratch)
            if (found != null) return found
        }
    }
    for (candidate in candidates) {
        if (budget.second == 0) break
        budget.second--
        if (work != null) work.second++
        val payload = secondLook(luminance, levels, candidate, work, true) ?: continue
        return result(payload, candidate.agreed.mirrored, candidate.inverted, where(candidate.location, 1))
    }
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
