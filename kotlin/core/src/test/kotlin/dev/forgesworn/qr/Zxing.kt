package dev.forgesworn.qr

import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.BitMatrix
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import com.google.zxing.qrcode.decoder.Decoder

/**
 * ZXing as a test oracle only: reads a greyscale picture with TRY_HARDER, dark on
 * light first and then light on dark. Returns the text, or null if it reads nothing.
 */
internal fun zxingRead(grey: Grey): String? {
    val hints = mapOf<DecodeHintType, Any>(DecodeHintType.TRY_HARDER to true)
    for (invert in listOf(false, true)) {
        val plain = PlanarYUVLuminanceSource(grey.data, grey.width, grey.height, 0, 0, grey.width, grey.height, false)
        val source = if (invert) plain.invert() else plain
        try {
            return QRCodeReader().decode(BinaryBitmap(HybridBinarizer(source)), hints).text
        } catch (_: Exception) {
            // Not readable this way round.
        }
    }
    return null
}

/**
 * The oracle's symbol decoder on the module grid itself, with no picture and
 * no detector in the way: format, version, codeword placement and
 * Reed-Solomon are all its own. Returns the text, or null if it rejects the grid.
 */
internal fun zxingReadModules(modules: ByteArray, size: Int): String? {
    val bits = BitMatrix(size)
    for (y in 0 until size) for (x in 0 until size) if (modules[y * size + x].toInt() == 1) bits.set(x, y)
    return try {
        Decoder().decode(bits).text
    } catch (_: Exception) {
        null
    }
}
