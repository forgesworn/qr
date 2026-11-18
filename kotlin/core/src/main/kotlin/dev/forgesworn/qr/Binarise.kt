package dev.forgesworn.qr

import kotlin.math.floor

/** A greyscale picture: one byte per pixel, 0 black to 255 white. */
internal class Luminance(val data: ByteArray, val width: Int, val height: Int)

/** A black-and-white picture: 1 for dark. */
internal class BitImage(val data: ByteArray, val width: Int, val height: Int)

/**
 * Greyscale from a Y plane (one byte a pixel), with an optional row stride in
 * pixels for padded camera planes.
 */
internal fun toLuminance(data: ByteArray, width: Int, height: Int, rowStride: Int): Luminance {
    if (rowStride == width && data.size == width * height) return Luminance(data, width, height)
    val out = ByteArray(width * height)
    for (y in 0 until height) {
        data.copyInto(out, y * width, y * rowStride, y * rowStride + width)
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
    val out = ByteArray(width * height)
    for (y in 0 until height) {
        for (x in 0 until width) {
            val p = argb[y * rowStride + x]
            val a = (p ushr 24) and 0xff
            val r = (p ushr 16) and 0xff
            val g = (p ushr 8) and 0xff
            val b = p and 0xff
            val grey = (r * 77 + g * 150 + b * 29) shr 8
            out[y * width + x] = ((grey * a + 255 * (255 - a)) / 255).toByte()
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

/** Each 8x8 block's own level, which blocks were flat, and the picture's range. */
internal class BlockLevels(
    val across: Int,
    val down: Int,
    val levels: DoubleArray,
    val flats: ByteArray,
    val flat: Boolean,
    val pictureMin: Int,
    val pictureMax: Int,
)

/**
 * A block's level is its mean, or for a flat block (range at most 24) half its
 * minimum, raised to its earlier neighbours' level when its minimum is below
 * that. Null under 40 pixels a side, where one global threshold serves.
 */
internal fun levelBlocks(image: Luminance): BlockLevels? {
    val data = image.data
    val width = image.width
    val height = image.height
    if (width < 40 || height < 40) return null
    val across = (width + BLOCK - 1) / BLOCK
    val down = (height + BLOCK - 1) / BLOCK
    val levels = DoubleArray(across * down)
    val flats = ByteArray(across * down)
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
                    for (x in left until left + BLOCK) sum += (data[y * width + x].toInt() and 0xff)
                    continue
                }
                for (x in left until left + BLOCK) {
                    val v = data[y * width + x].toInt() and 0xff
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
                flats[by * across + bx] = 1
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
    return BlockLevels(across, down, levels, flats, flat, pictureMin, pictureMax)
}

/**
 * Local thresholds: each 8x8 block's threshold is the mean of the block
 * averages in the 5x5 blocks around it, and a flat block borrows its
 * neighbours' level, so shadows and gradients across the frame do not
 * swallow the code. Pictures under 40 pixels a side get one global threshold.
 * [blocks] is [levelBlocks] of the picture, for a caller that has it already.
 */
internal fun thresholds(image: Luminance, blocks: BlockLevels? = levelBlocks(image)): Thresholds {
    if (blocks == null) {
        var min = 255
        var max = 0
        for (byte in image.data) {
            val v = byte.toInt() and 0xff
            if (v < min) min = v
            if (v > max) max = v
        }
        return Thresholds(1, 1, doubleArrayOf(if (max - min < MIN_DYNAMIC_RANGE) -1.0 else (min + max) / 2.0), uniform = min == max)
    }
    val across = blocks.across
    val down = blocks.down
    val levels = blocks.levels
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
    return Thresholds(across, down, values, blocks.flat && blocks.pictureMax - blocks.pictureMin > MIN_DYNAMIC_RANGE, blocks.pictureMin == blocks.pictureMax)
}

/**
 * [thresholds] with the flat blocks left out of every 5x5 average that also
 * holds a block with contrast (decoder step 23). A flat block's level is a
 * guess at background, often half its minimum, and beside a small or faint
 * code it drags the threshold below the code's own dark modules. Averages of
 * only flat or only contrasted blocks are unchanged. [blocks] is [levelBlocks]
 * of the picture. Null when no changed threshold puts any of its block's 64
 * pixels on the other side, as the binary picture would be the same; in
 * particular without both a flat block and over 24 levels of range.
 */
internal fun contrastThresholds(image: Luminance, blocks: BlockLevels): Thresholds? {
    val data = image.data
    val width = image.width
    val height = image.height
    val across = blocks.across
    val down = blocks.down
    val levels = blocks.levels
    val flats = blocks.flats
    if (!blocks.flat || blocks.pictureMax - blocks.pictureMin <= MIN_DYNAMIC_RANGE) return null
    val values = DoubleArray(across * down)
    var changes = false
    for (by in 0 until down) {
        val cy = minOf(maxOf(by, 2), down - 3)
        val top = minOf(by * BLOCK, height - BLOCK)
        for (bx in 0 until across) {
            val cx = minOf(maxOf(bx, 2), across - 3)
            var sum = 0.0
            var contrastSum = 0.0
            var contrasted = 0
            for (dy in -2..2) {
                val row = (cy + dy) * across + cx
                for (dx in -2..2) {
                    val level = levels[row + dx]
                    sum += level
                    if (flats[row + dx].toInt() == 0) {
                        contrastSum += level
                        contrasted++
                    }
                }
            }
            val before = sum / 25
            if (contrasted == 0 || contrasted == 25) {
                values[by * across + bx] = before
                continue
            }
            val after = contrastSum / contrasted
            values[by * across + bx] = after
            // A whole-number pixel is dark at or below floor(threshold), so it
            // changes side exactly when it lies above the lower floor and at or
            // below the higher one.
            if (changes) continue
            val low = floor(minOf(before, after)).toInt()
            val high = floor(maxOf(before, after)).toInt()
            if (low == high) continue
            val left = minOf(bx * BLOCK, width - BLOCK)
            scan@ for (y in top until top + BLOCK) {
                for (x in left until left + BLOCK) {
                    val v = data[y * width + x].toInt() and 0xff
                    if (v > low && v <= high) {
                        changes = true
                        break@scan
                    }
                }
            }
        }
    }
    if (!changes) return null
    return Thresholds(across, down, values, invertedFallback = true, uniform = false)
}

/** Invert luminance before thresholding: flat-block background estimates depend on polarity. */
internal fun invertLuminance(image: Luminance): Luminance =
    Luminance(ByteArray(image.data.size) { (255 - (image.data[it].toInt() and 0xff)).toByte() }, image.width, image.height)

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
        for (i in data.indices) out[i] = if ((data[i].toInt() and 0xff) <= threshold) 1 else 0
        return BitImage(out, width, height)
    }
    for (by in 0 until t.down) {
        val top = minOf(by * BLOCK, height - BLOCK)
        for (bx in 0 until t.across) {
            val left = minOf(bx * BLOCK, width - BLOCK)
            val threshold = t.values[by * t.across + bx]
            for (y in top until top + BLOCK) {
                for (x in left until left + BLOCK) out[y * width + x] = if ((data[y * width + x].toInt() and 0xff) <= threshold) 1 else 0
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
    val out = ByteArray(width * height)
    val sums = IntArray(width)
    val area = f * f
    val half = area / 2
    for (y in 0 until height) {
        sums.fill(0)
        for (j in 0 until f) {
            val row = (y * f + j) * image.width
            for (x in 0 until width) {
                var s = 0
                for (i in 0 until f) s += (image.data[row + x * f + i].toInt() and 0xff)
                sums[x] += s
            }
        }
        for (x in 0 until width) out[y * width + x] = ((sums[x] + half) / area).toByte()
    }
    return Luminance(out, width, height)
}

/** Bilinear enlargement by an integer factor, with pixel centres at i + 0.5. */
internal fun enlarge(image: Luminance, f: Int): Luminance {
    val width = image.width * f
    val height = image.height * f
    val data = ByteArray(width * height)
    for (y in 0 until height) {
        val fy = (y + 0.5) / f - 0.5
        val y0 = floor(fy).toInt().coerceIn(0, image.height - 1)
        val y1 = minOf(y0 + 1, image.height - 1)
        val ay = (fy - y0).coerceIn(0.0, 1.0)
        for (x in 0 until width) {
            val fx = (x + 0.5) / f - 0.5
            val x0 = floor(fx).toInt().coerceIn(0, image.width - 1)
            val x1 = minOf(x0 + 1, image.width - 1)
            val ax = (fx - x0).coerceIn(0.0, 1.0)
            val top = (image.data[y0 * image.width + x0].toInt() and 0xff) * (1 - ax) +
                (image.data[y0 * image.width + x1].toInt() and 0xff) * ax
            val bottom = (image.data[y1 * image.width + x0].toInt() and 0xff) * (1 - ax) +
                (image.data[y1 * image.width + x1].toInt() and 0xff) * ax
            data[y * width + x] = floor(top * (1 - ay) + bottom * ay + 0.5).toInt().toByte()
        }
    }
    return Luminance(data, width, height)
}

/** First quad pass reads unsigned bytes; later passes accumulate integer sums. */
private fun quads(data: ByteArray, width: Int, height: Int): IntArray {
    val across = width / 2
    val down = height / 2
    val out = IntArray(across * down)
    for (y in 0 until down) {
        val upper = 2 * y * width
        val lower = upper + width
        val row = y * across
        for (x in 0 until across) {
            out[row + x] = (data[upper + 2 * x].toInt() and 0xff) + (data[upper + 2 * x + 1].toInt() and 0xff) +
                (data[lower + 2 * x].toInt() and 0xff) + (data[lower + 2 * x + 1].toInt() and 0xff)
        }
    }
    return out
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
        val out = ByteArray(s.size)
        for (i in s.indices) out[i] = ((s[i] + half) shr shift).toByte()
        return Luminance(out, image.width / f, image.height / f)
    }
}
