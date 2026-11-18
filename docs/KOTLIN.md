# Generate and read QR codes from luminance in Kotlin/JVM

`io.github.forgesworn:qr` encodes and decodes standard QR codes on JVM 17 or
later. It takes a greyscale camera plane or packed ARGB pixels. The core uses
the Kotlin standard library and requires no Android API or service.

Add the dependency from Maven Central in Gradle.

```kotlin
repositories { mavenCentral() }
dependencies { implementation("io.github.forgesworn:qr:0.3.16") }
```

## Run a round trip with a padded luminance plane

This example draws the encoded modules into a one-byte-per-pixel plane with
a four-module quiet zone. The eight padding bytes per row exercise the same
stride argument you would use with a padded camera frame.

```kotlin
import dev.forgesworn.qr.decode
import dev.forgesworn.qr.encode

fun main() {
    val text = "https://example.com/kotlin-qr"
    val code = encode(text)
    val margin = 4
    val scale = 4
    val side = (code.size + 2 * margin) * scale
    val rowStride = side + 8
    val luminance = ByteArray(rowStride * side) { 255.toByte() }

    for (y in 0 until side) {
        for (x in 0 until side) {
            if (code.isDark(x / scale - margin, y / scale - margin)) {
                luminance[y * rowStride + x] = 0
            }
        }
    }

    val result = checkNotNull(decode(luminance, side, side, rowStride = rowStride))
    check(result.text == text)
    println(result.text)
}
```

With a camera, supply the luma bytes starting at the first image pixel, the
image dimensions and the number of bytes from one row to the next. The
decoder expects one byte per pixel within each row and ignores row padding.
For packed ARGB, pass an `IntArray` and give the row stride in pixels.

`decode` returns one result or `null`. The application owns camera permissions,
capture and display. The Kotlin encoder and decoder use the same
[specification](../SPEC.md) and [conformance vectors](../vectors/README.md)
as the other ports.
