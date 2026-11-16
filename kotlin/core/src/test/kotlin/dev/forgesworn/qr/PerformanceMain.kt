package dev.forgesworn.qr

import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.Result
import com.google.zxing.ResultMetadataType
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import java.io.File
import java.lang.management.ManagementFactory
import java.security.MessageDigest
import java.util.Properties
import java.util.jar.JarFile
import kotlin.math.ceil

/** Paired JVM measurements, separate from unit tests and the published library. */
internal data class BenchFrame(val name: String, val data: ByteArray, val width: Int, val height: Int, val expected: String? = null, val byteSegments: List<ByteArray> = emptyList())

internal fun frames(): List<BenchFrame> {
    val width = 1280
    val height = 720
    val text = "https://example.com/performance/0123456789"
    val qr = encode(text)
    check(text.all { it.code < 128 })
    var offset = 0
    val byteSegments = qr.segments.mapNotNull { segment ->
        val part = text.substring(offset, offset + segment.count).toByteArray(Charsets.US_ASCII)
        offset += segment.count
        if (segment.mode == Mode.BYTE) part else null
    }
    check(offset == text.length)
    val clean = ByteArray(width * height) { 230.toByte() }
    for (y in 0 until qr.size) for (x in 0 until qr.size) if (qr.isDark(x, y)) {
        for (dy in 0..8) clean.fill(25, (150 + y * 9 + dy) * width + 400 + x * 9, (150 + y * 9 + dy) * width + 409 + x * 9)
    }
    val result = arrayListOf(
        BenchFrame("clean", clean, width, height, text, byteSegments),
        BenchFrame("blank", ByteArray(width * height) { 200.toByte() }, width, height),
    )
    for ((w, h, seed) in listOf(Triple(width, height, 5), Triple(512, 512, 0x49ad7e32), Triple(1920, 1080, 0x49ad7e32))) {
        var state = seed
        val noise = ByteArray(w * h) { state = state * 1664525 + 1013904223; (state ushr 24).toByte() }
        result.add(BenchFrame("noise-${w}x$h", noise, w, h))
    }
    result.add(BenchFrame("stripes", ByteArray(width * height) { if ((it % width / 3) % 2 == 0) 25 else 230.toByte() }, width, height))
    result.add(BenchFrame("checkerboard", ByteArray(width * height) { if (((it % width / 4) + (it / width / 4)) % 2 == 0) 25 else 230.toByte() }, width, height))
    return result
}

private val hints = mapOf<DecodeHintType, Any>(DecodeHintType.TRY_HARDER to true)

private fun reference(frame: BenchFrame): Result? {
    val reader = QRCodeReader()
    val plain = PlanarYUVLuminanceSource(frame.data, frame.width, frame.height, 0, 0, frame.width, frame.height, false)
    for (inverted in listOf(false, true)) {
        try {
            return reader.decode(BinaryBitmap(HybridBinarizer(if (inverted) plain.invert() else plain)), hints)
        } catch (_: ReaderException) {
            // A decode rejection, not an unexpected implementation exception.
        }
    }
    return null
}

internal fun hash(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

internal fun command(vararg args: String): String {
    val process = ProcessBuilder(*args).redirectErrorStream(true).start()
    val result = process.inputStream.bufferedReader().readText().trim()
    check(process.waitFor() == 0) { "Command failed: ${args.first()}" }
    return result
}

internal fun json(value: Any?): String = when (value) {
    null -> "null"
    is String -> buildString {
        append('"')
        for (c in value) when (c) {
            '"' -> append("\\\"")
            '\\' -> append("\\\\")
            else -> if (c.code < 32) append("\\u" + c.code.toString(16).padStart(4, '0')) else append(c)
        }
        append('"')
    }
    is Number, is Boolean -> value.toString()
    is Map<*, *> -> value.entries.joinToString(",", "{", "}") { json(it.key.toString()) + ":" + json(it.value) }
    is Iterable<*> -> value.joinToString(",", "[", "]") { json(it) }
    else -> error("Unsupported JSON value")
}

fun main(args: Array<String>) {
    require(args.size == 1) { "Supply an output JSON filename" }
    val jar = File(QRCodeReader::class.java.protectionDomain.codeSource.location.toURI())
    val version = JarFile(jar).use { archive ->
        val properties = Properties()
        archive.getInputStream(archive.getJarEntry("META-INF/maven/com.google.zxing/core/pom.properties")).use(properties::load)
        properties.getProperty("version")
    }
    val allocations = (ManagementFactory.getThreadMXBean() as? com.sun.management.ThreadMXBean)?.takeIf { it.isThreadAllocatedMemorySupported }
    allocations?.isThreadAllocatedMemoryEnabled = true
    @Suppress("DEPRECATION") // Keep the test runner compatible with Java 17.
    val thread = Thread.currentThread().id
    val warmup = 200
    val rounds = 60
    val rows = arrayListOf<Map<String, Any?>>()
    val loadBefore = ManagementFactory.getOperatingSystemMXBean().systemLoadAverage
    val gc = ManagementFactory.getGarbageCollectorMXBeans()
    val gcBefore = gc.associate { it.name to it.collectionCount }
    for (frame in frames()) {
        val times = Array(2) { arrayListOf<Double>() }
        val allocated = Array(2) { arrayListOf<Long>() }
        val expected = frame.expected?.toByteArray(Charsets.UTF_8)
        val warmUntil = System.nanoTime() + 2_000_000_000L
        var iteration = 0
        var measured = 0
        while (measured < rounds) {
            val warming = iteration < warmup || System.nanoTime() < warmUntil
            for (which in if (iteration and 1 == 0) listOf(0, 1) else listOf(1, 0)) {
                val bytesBefore = allocations?.getThreadAllocatedBytes(thread)
                val start = System.nanoTime()
                val result: Any? = if (which == 0) decode(frame.data, frame.width, frame.height) else reference(frame)
                val elapsed = (System.nanoTime() - start) / 1e6
                val bytesAfter = allocations?.getThreadAllocatedBytes(thread)
                val text = when (result) { is DecodeResult -> result.text; is Result -> result.text; else -> null }
                check(text == frame.expected) { "${frame.name}/$which returned $text" }
                if (expected != null) {
                    when (result) {
                        is DecodeResult -> check(result.bytes.contentEquals(expected)) { "${frame.name} payload bytes differ" }
                        is Result -> {
                            @Suppress("UNCHECKED_CAST")
                            val segments = result.resultMetadata[ResultMetadataType.BYTE_SEGMENTS] as? List<ByteArray>
                            check(segments != null && segments.size == frame.byteSegments.size) { "Expected byte segments in the URL fixture" }
                            check(segments.zip(frame.byteSegments).all { (got, want) -> got.contentEquals(want) }) { "${frame.name} ZXing byte segments differ" }
                        }
                        else -> error("Missing result")
                    }
                }
                if (!warming) {
                    times[which].add(elapsed)
                    if (bytesBefore != null && bytesAfter != null) allocated[which].add(bytesAfter - bytesBefore)
                }
            }
            iteration++
            if (!warming) measured++
        }

        fun summary(which: Int): Map<String, Any?> {
            val sorted = times[which].sorted()
            return linkedMapOf("medianMs" to sorted[rounds / 2], "p95Ms" to sorted[ceil(rounds * .95).toInt() - 1],
                "medianAllocatedBytes" to allocated[which].sorted().takeIf { it.isNotEmpty() }?.get(rounds / 2), "samplesMs" to times[which])
        }
        rows.add(linkedMapOf("name" to frame.name, "width" to frame.width, "height" to frame.height,
            "greySha256" to hash(frame.data), "expectedText" to frame.expected, "warmupRounds" to iteration - rounds,
            "kotlin" to summary(0), "zxing" to summary(1)))
    }
    val sources = MessageDigest.getInstance("SHA-256")
    val sourceRoot = File("kotlin/core/src/main/kotlin")
    for (file in sourceRoot.walkTopDown().filter { it.isFile && it.extension == "kt" }.sortedBy { it.relativeTo(sourceRoot).path }) {
        sources.update(file.relativeTo(sourceRoot).invariantSeparatorsPath.toByteArray())
        sources.update(file.readBytes())
    }
    val result = linkedMapOf("revision" to command("git", "rev-parse", "HEAD"), "dirty" to command("git", "status", "--porcelain").isNotEmpty(),
        "kotlinSourceSha256" to sources.digest().joinToString("") { "%02x".format(it) },
        "harnessSha256" to hash(File("kotlin/core/src/test/kotlin/dev/forgesworn/qr/PerformanceMain.kt").readBytes()),
        "zxingVersion" to version, "zxingJarSha256" to hash(jar.readBytes()),
        "javaVersion" to System.getProperty("java.runtime.version"), "javaVm" to System.getProperty("java.vm.name"),
        "jvmArguments" to ManagementFactory.getRuntimeMXBean().inputArguments,
        "arch" to System.getProperty("os.arch"), "os" to System.getProperty("os.name"),
        "loadBefore" to loadBefore, "loadAfter" to ManagementFactory.getOperatingSystemMXBean().systemLoadAverage,
        "cpu" to if (System.getProperty("os.name") == "Mac OS X") command("sysctl", "-n", "machdep.cpu.brand_string") else null,
        "heapBytes" to Runtime.getRuntime().maxMemory(), "input" to "packed 8-bit greyscale", "minimumWarmupRounds" to warmup,
        "minimumWarmupSeconds" to 2, "rounds" to rounds,
        "validation" to "exact text, Kotlin payload bytes and ZXing byte segments; numeric/alphanumeric through ASCII text",
        "zxingOptions" to listOf("QRCodeReader", "HybridBinarizer", "TRY_HARDER", "normal then inverted"),
        "gcCollectionsBefore" to gcBefore, "gcCollectionsAfter" to gc.associate { it.name to it.collectionCount }, "rows" to rows)
    File(args[0]).writeText(json(result) + "\n")
    println("Verified $rounds paired rounds per frame after at least $warmup warm-ups; ZXing $version")
}
