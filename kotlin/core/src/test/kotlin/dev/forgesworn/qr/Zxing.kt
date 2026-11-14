package dev.forgesworn.qr

import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader

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
