package dev.forgesworn.qr

import java.io.File

/** A tiny JSON reader, enough for the shared vector files: objects, arrays, strings, numbers, booleans, null. */
internal class Json private constructor(private val s: String) {
    private var i = 0

    companion object {
        fun parse(text: String): Any? {
            val reader = Json(text)
            val value = reader.value()
            reader.skip()
            if (reader.i != text.length) throw IllegalArgumentException("Trailing JSON at ${reader.i}")
            return value
        }
    }

    private fun skip() {
        while (i < s.length && s[i].isWhitespace()) i++
    }

    private fun value(): Any? {
        skip()
        return when (val c = s[i]) {
            '{' -> obj()
            '[' -> arr()
            '"' -> str()
            't' -> literal("true", true)
            'f' -> literal("false", false)
            'n' -> literal("null", null)
            else -> if (c == '-' || c.isDigit()) num() else throw IllegalArgumentException("Unexpected '$c' at $i")
        }
    }

    private fun literal(word: String, v: Any?): Any? {
        if (!s.startsWith(word, i)) throw IllegalArgumentException("Bad literal at $i")
        i += word.length
        return v
    }

    private fun num(): Any {
        val start = i
        if (s[i] == '-') i++
        while (i < s.length && (s[i].isDigit() || s[i] in ".eE+-")) i++
        val t = s.substring(start, i)
        return t.toLongOrNull() ?: t.toDouble()
    }

    private fun str(): String {
        i++
        val sb = StringBuilder()
        while (s[i] != '"') {
            val c = s[i++]
            if (c != '\\') {
                sb.append(c)
                continue
            }
            when (val e = s[i++]) {
                '"' -> sb.append('"')
                '\\' -> sb.append('\\')
                '/' -> sb.append('/')
                'b' -> sb.append('\b')
                'f' -> sb.append('\u000c')
                'n' -> sb.append('\n')
                'r' -> sb.append('\r')
                't' -> sb.append('\t')
                'u' -> {
                    sb.append(s.substring(i, i + 4).toInt(16).toChar())
                    i += 4
                }
                else -> throw IllegalArgumentException("Bad escape \\$e")
            }
        }
        i++
        return sb.toString()
    }

    private fun arr(): List<Any?> {
        i++
        val out = ArrayList<Any?>()
        skip()
        if (s[i] == ']') {
            i++
            return out
        }
        while (true) {
            out.add(value())
            skip()
            if (s[i++] == ']') return out
        }
    }

    private fun obj(): Map<String, Any?> {
        i++
        val out = LinkedHashMap<String, Any?>()
        skip()
        if (s[i] == '}') {
            i++
            return out
        }
        while (true) {
            skip()
            val key = str()
            skip()
            if (s[i++] != ':') throw IllegalArgumentException("Expected ':' at $i")
            out[key] = value()
            skip()
            if (s[i++] == '}') return out
        }
    }
}

internal fun vectorsDir(): File = File(System.getProperty("qr.vectors") ?: error("qr.vectors is not set"))

@Suppress("UNCHECKED_CAST")
internal fun readJsonObject(file: File): Map<String, Any?> = Json.parse(file.readText()) as Map<String, Any?>

internal class EncodeVector(
    val id: String,
    val text: String,
    val ecc: ErrorCorrection,
    val eci: Boolean,
    val requestedVersion: Int?,
    val requestedMask: Int?,
    val version: Int,
    val mask: Int,
    val mode: Mode,
    val size: Int,
    val rows: List<String>,
)

@Suppress("UNCHECKED_CAST")
internal fun encodeVectors(): List<EncodeVector> {
    val root = readJsonObject(File(vectorsDir(), "encode-vectors.json"))
    return (root["vectors"] as List<Map<String, Any?>>).map { v ->
        EncodeVector(
            id = v["id"] as String,
            text = v["text"] as String,
            ecc = ErrorCorrection.valueOf(v["ecc"] as String),
            eci = v["eci"] as Boolean,
            requestedVersion = (v["requestedVersion"] as Long?)?.toInt(),
            requestedMask = (v["requestedMask"] as Long?)?.toInt(),
            version = (v["version"] as Long).toInt(),
            mask = (v["mask"] as Long).toInt(),
            mode = Mode.valueOf((v["mode"] as String).uppercase()),
            size = (v["size"] as Long).toInt(),
            rows = v["rows"] as List<String>,
        )
    }
}

/** Row hex (bytes MSB first, padded to whole bytes) to one byte per module. */
internal fun fromRows(rows: List<String>, size: Int): ByteArray {
    val m = ByteArray(size * size)
    rows.forEachIndexed { y, row ->
        for (x in 0 until size) {
            val byte = row.substring((x shr 3) * 2, (x shr 3) * 2 + 2).toInt(16)
            m[y * size + x] = ((byte shr (7 - (x and 7))) and 1).toByte()
        }
    }
    return m
}

/** One byte per module to row hex, the inverse of [fromRows]. */
internal fun toRows(modules: ByteArray, size: Int): List<String> {
    val out = ArrayList<String>()
    for (y in 0 until size) {
        val row = StringBuilder()
        var x = 0
        while (x < size) {
            var b = 0
            for (k in 0 until 8) b = (b shl 1) or (if (x + k < size) modules[y * size + x + k].toInt() else 0)
            row.append("%02x".format(b))
            x += 8
        }
        out.add(row.toString())
    }
    return out
}

internal fun transpose(modules: ByteArray, size: Int): ByteArray {
    val t = ByteArray(size * size)
    for (y in 0 until size) for (x in 0 until size) t[x * size + y] = modules[y * size + x]
    return t
}

/** A greyscale picture, one byte a pixel, 0 black to 255 white. */
internal class Grey(val data: ByteArray, val width: Int, val height: Int)

/** Draws a symbol straight, [scale] pixels a module, with a quiet zone of [quiet] modules. */
internal fun picture(modules: ByteArray, size: Int, scale: Int, quiet: Int = 4, invert: Boolean = false): Grey {
    val side = (size + 2 * quiet) * scale
    val data = ByteArray(side * side)
    val light = if (invert) 0 else 255
    val dark = if (invert) 255 else 0
    for (py in 0 until side) {
        for (px in 0 until side) {
            val mx = px / scale - quiet
            val my = py / scale - quiet
            val isDark = mx in 0 until size && my in 0 until size && modules[my * size + mx].toInt() == 1
            data[py * side + px] = (if (isDark) dark else light).toByte()
        }
    }
    return Grey(data, side, side)
}

/**
 * A symbol seen through a lens that bends it, drawn as test/photo.ts bent()
 * draws it: each picture point samples the straight drawing ([scale] pixels a
 * module, four modules of quiet zone) at its offset from the centre times
 * 1 + k r^2, r in half-sides. Four samples a pixel.
 */
internal fun bent(modules: ByteArray, size: Int, scale: Int, k: Double, invert: Boolean = false): Grey {
    val quiet = 4
    val side = (size + 2 * quiet) * scale
    val c = side / 2.0
    val data = ByteArray(side * side)
    for (py in 0 until side) {
        for (px in 0 until side) {
            var sum = 0
            for (sy in 0 until 2) {
                for (sx in 0 until 2) {
                    val x = px + (sx + 0.5) / 2 - c
                    val y = py + (sy + 0.5) / 2 - c
                    val f = 1 + (k * (x * x + y * y)) / (c * c)
                    val mx = kotlin.math.floor((c + x * f) / scale).toInt() - quiet
                    val my = kotlin.math.floor((c + y * f) / scale).toInt() - quiet
                    val dark = mx >= 0 && my >= 0 && mx < size && my < size && modules[my * size + mx].toInt() == 1
                    sum += if (dark != invert) 30 else 225
                }
            }
            data[py * side + px] = (sum / 4).toByte()
        }
    }
    return Grey(data, side, side)
}
