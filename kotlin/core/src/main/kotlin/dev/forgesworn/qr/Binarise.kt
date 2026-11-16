package dev.forgesworn.qr

/** A greyscale picture: one byte per pixel, 0 black to 255 white (stored as Int, 0..255). */
internal class Luminance(val data: IntArray, val width: Int, val height: Int)

/** A black-and-white picture: 1 for dark. */
internal class BitImage(val data: ByteArray, val width: Int, val height: Int)

/**
 * Greyscale from a Y plane (one byte a pixel), with an optional row stride in
 * pixels for padded camera planes.
 */
internal fun toLuminance(data: ByteArray, width: Int, height: Int, rowStride: Int): Luminance {
    val out = IntArray(width * height)
    for (y in 0 until height) {
        for (x in 0 until width) {
            out[y * width + x] = data[y * rowStride + x].toInt() and 0xff
        }
    }
    return Luminance(out, width, height)
}

/**
 * Greyscale from packed ARGB pixels (Android's `Bitmap.getPixels` layout), with
 * an optional row stride in pixels. Transparent pixels count as white, so a
 * code drawn on a transparent canvas still reads. The grey is
 * `(77 R + 150 G + 29 B) >> 8`, blended onto white by alpha.
 */
internal fun toLuminance(argb: IntArray, width: Int, height: Int, rowStride: Int): Luminance {
    val out = IntArray(width * height)
    for (y in 0 until height) {
        for (x in 0 until width) {
            val p = argb[y * rowStride + x]
            val a = (p ushr 24) and 0xff
            val r = (p ushr 16) and 0xff
            val g = (p ushr 8) and 0xff
            val b = p and 0xff
            val grey = (r * 77 + g * 150 + b * 29) shr 8
            out[y * width + x] = (grey * a + 255 * (255 - a)) / 255
        }
    }
    return Luminance(out, width, height)
}

private const val BLOCK = 8
private const val MIN_DYNAMIC_RANGE = 24

/**
 * The binariser's thresholds: one an 8x8 block, [across] by [down], or a
 * single one for the whole picture when it is under 40 pixels a side.
 */
internal class Thresholds(val across: Int, val down: Int, val values: DoubleArray, val invertedFallback: Boolean = false, val uniform: Boolean = false)

/**
 * Local thresholds: each 8x8 block's threshold is the mean of the block
 * averages in the 5x5 blocks around it, and a flat block borrows its
 * neighbours' level, so shadows and gradients across the frame do not
 * swallow the code. Pictures under 40 pixels a side get one global threshold.
 */
internal fun thresholds(image: Luminance): Thresholds {
    val data = image.data
    val width = image.width
    val height = image.height
    if (width < 40 || height < 40) {
        var min = 255
        var max = 0
        for (v in data) {
            if (v < min) min = v
            if (v > max) max = v
        }
        return Thresholds(1, 1, doubleArrayOf(if (max - min < MIN_DYNAMIC_RANGE) -1.0 else (min + max) / 2.0), uniform = min == max)
    }
    val across = (width + BLOCK - 1) / BLOCK
    val down = (height + BLOCK - 1) / BLOCK
    val levels = DoubleArray(across * down)
    var flat = false
    var pictureMin = 255
    var pictureMax = 0
    for (by in 0 until down) {
        val top = minOf(by * BLOCK, height - BLOCK)
        for (bx in 0 until across) {
            val left = minOf(bx * BLOCK, width - BLOCK)
            var sum = 0
            var min = 255
            var max = 0
            for (y in top until top + BLOCK) {
                // Once the range is wide enough only the sum affects the level.
                if (max - min > MIN_DYNAMIC_RANGE) {
                    for (x in left until left + BLOCK) sum += data[y * width + x]
                    continue
                }
                for (x in left until left + BLOCK) {
                    val v = data[y * width + x]
                    sum += v
                    if (v < min) min = v
                    if (v > max) max = v
                }
            }
            var level = sum.toDouble() / (BLOCK * BLOCK)
            pictureMin = minOf(pictureMin, min)
            pictureMax = maxOf(pictureMax, max)
            if (max - min <= MIN_DYNAMIC_RANGE) {
                flat = true
                // A flat block: assume it is background unless its neighbours say otherwise.
                level = min / 2.0
                if (bx > 0 && by > 0) {
                    val around =
                        (levels[(by - 1) * across + bx] + 2 * levels[by * across + bx - 1] + levels[(by - 1) * across + bx - 1]) / 4
                    if (min < around) level = around
                }
            }
            levels[by * across + bx] = level
        }
    }
    val values = DoubleArray(across * down)
    for (by in 0 until down) {
        val cy = minOf(maxOf(by, 2), down - 3)
        for (bx in 0 until across) {
            val cx = minOf(maxOf(bx, 2), across - 3)
            var sum = 0.0
            var n = 0
            for (dy in -2..2) {
                for (dx in -2..2) {
                    val yy = cy + dy
                    val xx = cx + dx
                    if (yy < 0 || xx < 0 || yy >= down || xx >= across) continue
                    sum += levels[yy * across + xx]
                    n++
                }
            }
            values[by * across + bx] = sum / n
        }
    }
    return Thresholds(across, down, values, flat && pictureMax - pictureMin > MIN_DYNAMIC_RANGE, pictureMin == pictureMax)
}

/** Invert luminance before thresholding: flat-block background estimates depend on polarity. */
internal fun invertLuminance(image: Luminance): Luminance =
    Luminance(IntArray(image.data.size) { 255 - image.data[it] }, image.width, image.height)

/**
 * The threshold [binarise] applied at pixel ([px], [py]), which must be in the
 * picture. The last block in a row or column covers the last 8 pixels, so it
 * overlaps the one before it and wins where they overlap.
 */
internal fun thresholdAt(t: Thresholds, width: Int, height: Int, px: Int, py: Int): Double {
    if (t.across == 1 && t.down == 1) return t.values[0]
    val bx = if (px >= width - BLOCK) t.across - 1 else px / BLOCK
    val by = if (py >= height - BLOCK) t.down - 1 else py / BLOCK
    return t.values[by * t.across + bx]
}

/**
 * Local-threshold binarisation: 1 where a pixel is at or below its threshold.
 * [t] is the picture's [thresholds], for a caller that has them already.
 */
internal fun binarise(image: Luminance, t: Thresholds = thresholds(image)): BitImage {
    val data = image.data
    val width = image.width
    val height = image.height
    val out = ByteArray(width * height)
    if (width < 40 || height < 40) {
        val threshold = t.values[0]
        for (i in data.indices) out[i] = if (data[i] <= threshold) 1 else 0
        return BitImage(out, width, height)
    }
    for (by in 0 until t.down) {
        val top = minOf(by * BLOCK, height - BLOCK)
        for (bx in 0 until t.across) {
            val left = minOf(bx * BLOCK, width - BLOCK)
            val threshold = t.values[by * t.across + bx]
            for (y in top until top + BLOCK) {
                for (x in left until left + BLOCK) out[y * width + x] = if (data[y * width + x] <= threshold) 1 else 0
            }
        }
    }
    return BitImage(out, width, height)
}

internal fun invert(image: BitImage): BitImage {
    val out = ByteArray(image.data.size)
    for (i in out.indices) out[i] = (image.data[i].toInt() xor 1).toByte()
    return BitImage(out, image.width, image.height)
}

/**
 * The picture shrunk by [f] (decoder step 9): floor(width / f) by
 * floor(height / f) pixels, each the mean of an f x f square, rounded as
 * (sum + floor(f * f / 2)) div (f * f). Columns and rows past the last whole
 * square are dropped.
 */
internal fun shrink(image: Luminance, f: Int): Luminance {
    val width = image.width / f
    val height = image.height / f
    val out = IntArray(width * height)
    val sums = IntArray(width)
    val area = f * f
    val half = area / 2
    for (y in 0 until height) {
        sums.fill(0)
        for (j in 0 until f) {
            val row = (y * f + j) * image.width
            for (x in 0 until width) {
                var s = 0
                for (i in 0 until f) s += image.data[row + x * f + i]
                sums[x] += s
            }
        }
        for (x in 0 until width) out[y * width + x] = (sums[x] + half) / area
    }
    return Luminance(out, width, height)
}

/** Sums of the 2 x 2 squares of a grid [width] by [height]: width / 2 by height / 2 of them. */
private fun quads(data: IntArray, width: Int, height: Int): IntArray {
    val across = width / 2
    val down = height / 2
    val out = IntArray(across * down)
    for (y in 0 until down) {
        val upper = 2 * y * width
        val lower = upper + width
        val row = y * across
        for (x in 0 until across) out[row + x] = data[upper + 2 * x] + data[upper + 2 * x + 1] + data[lower + 2 * x] + data[lower + 2 * x + 1]
    }
    return out
}

/**
 * [shrink] for the factors 2, 4 and 8, from one pass over the picture: the
 * 2 x 2 sums, then sums of those, each made when first asked for. A square
 * of 4 is four squares of 2 and holds the same pixels, so the sums, and the
 * pictures, are the ones [shrink] gives.
 */
internal class Reductions(private val image: Luminance) {
    private val sums = arrayOfNulls<IntArray>(3)

    private fun level(n: Int): IntArray {
        var s = sums[n]
        if (s == null) {
            val f = 1 shl n
            s = if (n == 0) quads(image.data, image.width, image.height) else quads(level(n - 1), image.width / f, image.height / f)
            sums[n] = s
        }
        return s
    }

    /** The picture shrunk by [f], which is 2, 4 or 8. */
    fun by(f: Int): Luminance {
        val n = if (f == 2) 0 else if (f == 4) 1 else 2
        val s = level(n)
        val shift = 2 * (n + 1)
        val half = 1 shl (shift - 1)
        val out = IntArray(s.size)
        for (i in s.indices) out[i] = (s[i] + half) shr shift
        return Luminance(out, image.width / f, image.height / f)
    }
}
