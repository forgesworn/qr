import dev.forgesworn.qr.*

fun main() {
    for (text in listOf("https://example.com/registry", "QR publication ✓")) {
        val qr = encode(text)
        val result = checkNotNull(decodeModules(qr.modules, qr.size))
        check(result.text == text)
        check(result.bytes.contentEquals(text.toByteArray(Charsets.UTF_8)))
        val scale = 4
        val side = (qr.size + 8) * scale
        val pixels = ByteArray(side * side) { -1 }
        for (y in 0 until qr.size) for (x in 0 until qr.size) {
            if (qr.isDark(x, y)) for (dy in 0 until scale) for (dx in 0 until scale) {
                pixels[((y + 4) * scale + dy) * side + (x + 4) * scale + dx] = 0
            }
        }
        check(checkNotNull(decode(pixels, side, side)).text == text)
    }
    val raw = byteArrayOf(0, 127, -1)
    val qr = encode(raw)
    check(checkNotNull(decodeModules(qr.modules, qr.size)).bytes.contentEquals(raw))
    check(runCatching { decodeModules(ByteArray(0), Int.MAX_VALUE) }.exceptionOrNull() is IllegalArgumentException)
    println("Published Kotlin package: text, bytes, module and pixel decoding and invalid dimensions passed")
}
