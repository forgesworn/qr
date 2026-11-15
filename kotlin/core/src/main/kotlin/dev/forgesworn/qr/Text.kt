package dev.forgesworn.qr

// UTF-8 decoding by hand, so a malformed byte becomes U+FFFD exactly as the
// specification says on every platform. Bytes are Ints holding 0..255.

/** Length of the well-formed UTF-8 sequence at [i], or 0 if it is not one. */
private fun sequence(bytes: IntArray, i: Int): Int {
    val b = bytes[i]
    if (b < 0x80) return 1
    val length = if (b in 0xc2..0xdf) 2 else if (b in 0xe0..0xef) 3 else if (b in 0xf0..0xf4) 4 else 0
    if (length == 0 || i + length > bytes.size) return 0
    val second = bytes[i + 1]
    val low = if (b == 0xe0) 0xa0 else if (b == 0xf0) 0x90 else 0x80
    val high = if (b == 0xed) 0x9f else if (b == 0xf4) 0x8f else 0xbf
    if (second < low || second > high) return 0
    for (k in 2 until length) if ((bytes[i + k] and 0xc0) != 0x80) return 0
    return length
}

/** True when [bytes] is entirely well-formed UTF-8. */
internal fun isUtf8(bytes: IntArray): Boolean {
    var i = 0
    while (i < bytes.size) {
        val n = sequence(bytes, i)
        if (n == 0) return false
        i += n
    }
    return true
}

/** Decodes UTF-8, replacing each ill-formed byte with U+FFFD. */
internal fun fromUtf8(bytes: IntArray): String {
    val out = StringBuilder()
    var i = 0
    while (i < bytes.size) {
        val n = sequence(bytes, i)
        if (n == 0) {
            out.append('�')
            i++
            continue
        }
        val b = bytes[i]
        var cp = if (n == 1) b else b and (0xff ushr (n + 1))
        for (k in 1 until n) cp = (cp shl 6) or (bytes[i + k] and 0x3f)
        out.appendCodePoint(cp)
        i += n
    }
    return out.toString()
}

// Other character sets come from java.nio.charset. A name the runtime lacks
// (some live in the jdk.charsets module) leaves the caller to fall back.

private val CANDIDATES: Map<Int, List<String>> = mapOf(
    4 to listOf("ISO-8859-2"), 5 to listOf("ISO-8859-3"), 6 to listOf("ISO-8859-4"),
    7 to listOf("ISO-8859-5"), 8 to listOf("ISO-8859-6"), 9 to listOf("ISO-8859-7"),
    10 to listOf("ISO-8859-8"), 11 to listOf("ISO-8859-9"),
    12 to listOf("ISO-8859-10", "x-ISO-8859-10"),
    13 to listOf("x-iso-8859-11", "TIS-620", "windows-874", "x-windows-874"),
    15 to listOf("ISO-8859-13"),
    16 to listOf("ISO-8859-14", "x-ISO-8859-14"),
    17 to listOf("ISO-8859-15"),
    18 to listOf("ISO-8859-16", "x-ISO-8859-16"),
    20 to listOf("windows-31j", "Shift_JIS"),
    21 to listOf("windows-1250"), 22 to listOf("windows-1251"),
    24 to listOf("windows-1256"),
    25 to listOf("UTF-16BE"),
    28 to listOf("x-windows-950", "Big5-HKSCS", "Big5"),
    29 to listOf("GB18030", "GBK"), 31 to listOf("GB18030", "GBK"), 32 to listOf("GB18030", "GBK"),
    30 to listOf("x-windows-949", "EUC-KR"),
    33 to listOf("UTF-16LE"),
)

/** Bytes a set leaves undefined; platforms disagree on them, so they are U+FFFD. */
private val UNDEFINED: Map<Int, Set<Int>> = mapOf(
    13 to setOf(0xdb, 0xdc, 0xdd, 0xde, 0xfc, 0xfd, 0xfe, 0xff),
    21 to setOf(0x81, 0x83, 0x88, 0x90, 0x98),
    22 to setOf(0x98),
)

/**
 * Windows 1252 at bytes 0x80 to 0x9F, 0 where the code page leaves the byte
 * undefined. Every other byte is the Latin-1 character of the same value.
 * Read by hand in every port, since platforms have differed on this set.
 */
private val WINDOWS_1252 = intArrayOf(
    0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
    0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
)

private val charsets = java.util.concurrent.ConcurrentHashMap<Int, java.util.Optional<java.nio.charset.Charset>>()

private fun charsetFor(eci: Int): java.nio.charset.Charset? =
    charsets.computeIfAbsent(eci) {
        var found: java.nio.charset.Charset? = null
        for (name in CANDIDATES[eci] ?: emptyList()) {
            try {
                found = java.nio.charset.Charset.forName(name)
                break
            } catch (e: IllegalArgumentException) {
                // not available on this runtime; try the next name
            }
        }
        java.util.Optional.ofNullable(found)
    }.orElse(null)

private fun decodeWith(charset: java.nio.charset.Charset, bytes: IntArray): String {
    val buffer = java.nio.ByteBuffer.wrap(ByteArray(bytes.size) { bytes[it].toByte() })
    return charset.newDecoder()
        .onMalformedInput(java.nio.charset.CodingErrorAction.REPLACE)
        .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPLACE)
        .decode(buffer)
        .toString()
}

/** The single-byte sets among the ECIs: ISO 8859 and the Windows code pages, all of them ASCII below 0x80. */
private val SINGLE_BYTE: Set<Int> = setOf(4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 21, 22, 24)

/**
 * Text for bytes under an ECI this runtime cannot read, or one that names no
 * set this decoder knows: never a guess at another character set. Under a
 * single-byte set the ASCII bytes are certain and are kept; every other
 * byte, and every byte under any other ECI, is U+FFFD.
 */
internal fun unread(eci: Int, bytes: IntArray): String {
    val ascii = eci in SINGLE_BYTE
    val s = StringBuilder()
    for (b in bytes) s.append(if (ascii && b < 0x80) b.toChar() else '\ufffd')
    return s.toString()
}

/**
 * Text for [bytes] under an ECI assignment other than 1, 3 and 26, or null
 * when the runtime lacks the character set (the caller then uses [unread]).
 */
internal fun fromEci(eci: Int, bytes: IntArray): String? {
    if (eci == 27 || eci == 170) {
        val s = StringBuilder()
        for (b in bytes) s.append(if (b < 0x80) b.toChar() else '�')
        return s.toString()
    }
    if (eci == 23) {
        val s = StringBuilder()
        for (b in bytes) s.append(if (b < 0x80 || b > 0x9f) b.toChar() else (WINDOWS_1252[b - 0x80].takeIf { it != 0 } ?: 0xfffd).toChar())
        return s.toString()
    }
    val charset = charsetFor(eci) ?: return null
    val text = decodeWith(charset, bytes)
    val iso = eci in 4..18
    val undefined = UNDEFINED[eci]
    if ((!iso && undefined == null) || text.length != bytes.size) return text
    val out = StringBuilder()
    for (i in bytes.indices) {
        val b = bytes[i]
        if (iso && b in 0x80..0x9f) out.append(b.toChar())
        else if (undefined != null && b in undefined) out.append('�')
        else out.append(text[i])
    }
    return out.toString()
}

/** One kanji-mode character from its Shift_JIS bytes: the runtime's reading, or U+FFFD alone. */
internal fun kanjiText(sjis: Int): String {
    val charset = charsetFor(20) ?: return "�"
    val text = decodeWith(charset, intArrayOf(sjis ushr 8, sjis and 0xff))
    return if (text.contains('�')) "�" else text
}

/**
 * Twelve cells GB2312 leaves empty that GBK and older GB 18030 tables make
 * private-use and newer GB 18030 tables make characters; platforms disagree,
 * so they reject a hanzi symbol like any other empty cell.
 */
private fun editionDependent(lead: Int, low: Int): Boolean {
    if (lead == 0xa6) return low in 0xd9..0xdf || low == 0xec || low == 0xed || low == 0xf3
    return lead == 0xa8 && (low == 0xbc || low == 0xbf)
}

/**
 * One hanzi-mode character from its GB2312 lead and low bytes: the runtime's
 * GB 18030 reading (GBK where it lacks GB 18030), or U+FFFD alone when it has neither. Null, rejecting the
 * symbol, when the pair is outside the GB2312 rows (A1-A9 and B0-F7, cells
 * A1-FE) or names no character (U+FFFD or a private-use character).
 */
internal fun hanziText(lead: Int, low: Int): String? {
    if (low < 0xa1 || low > 0xfe || lead < 0xa1 || lead > 0xf7 || (lead > 0xa9 && lead < 0xb0)) return null
    if (editionDependent(lead, low)) return null
    val charset = charsetFor(29) ?: return "\ufffd"
    val text = decodeWith(charset, intArrayOf(lead, low))
    if (text.isEmpty()) return null
    val cp = text.codePointAt(0)
    if (text.length != Character.charCount(cp) || cp == 0xfffd || cp in 0xe000..0xf8ff) return null
    return text
}

/**
 * Whether bytes that are not valid UTF-8 and carry no ECI look like Shift_JIS
 * rather than Latin-1. Scanning left to right, a byte below 0x80 is skipped;
 * 0xA1 to 0xDF is a half-width katakana; 0x81 to 0x9F or 0xE0 to 0xEF followed
 * by 0x40 to 0x7E or 0x80 to 0xFC is a double-byte character; anything else of
 * 0x80 or more (0x80, 0xA0, 0xF0 to 0xFF, or a lead without a trail) rules
 * Shift_JIS out. With none ruled out, it is Shift_JIS if the bytes hold three
 * katakana in a row, three double-byte characters in a row, or a double-byte
 * character whose lead is 0x81 to 0x9F (a control in Latin-1, so never text
 * there); otherwise it is Latin-1.
 */
internal fun looksShiftJis(bytes: IntArray): Boolean {
    var kana = 0
    var pairs = 0
    var strong = false
    var i = 0
    while (i < bytes.size) {
        val b = bytes[i]
        if (b < 0x80) {
            kana = 0
            pairs = 0
            i++
        } else if (b in 0xa1..0xdf) {
            pairs = 0
            if (++kana >= 3) strong = true
            i++
        } else if (b in 0x81..0x9f || b in 0xe0..0xef) {
            if (i + 1 >= bytes.size) return false
            val t = bytes[i + 1]
            if (t < 0x40 || t == 0x7f || t > 0xfc) return false
            kana = 0
            if (++pairs >= 3 || b <= 0x9f) strong = true
            i += 2
        } else {
            return false
        }
    }
    return strong
}
