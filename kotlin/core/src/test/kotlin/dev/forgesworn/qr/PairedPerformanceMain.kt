package dev.forgesworn.qr

import java.io.File
import java.lang.management.ManagementFactory
import java.lang.reflect.InvocationTargetException
import java.net.URLClassLoader
import kotlin.math.ceil

/** Load only the selected QR jar's classes; share Kotlin and the JDK. */
private class QrLoader(jar: File) : URLClassLoader(arrayOf(jar.toURI().toURL()), QrLoader::class.java.classLoader) {
    override fun loadClass(name: String, resolve: Boolean): Class<*> {
        if (!name.startsWith("dev.forgesworn.qr.")) return super.loadClass(name, resolve)
        synchronized(getClassLoadingLock(name)) {
            val type = findLoadedClass(name) ?: findClass(name)
            if (resolve) resolveClass(type)
            return type
        }
    }
}

private class Library(val jar: File, val loader: QrLoader) {
    private val decoder = loader.loadClass("dev.forgesworn.qr.DecodeKt")
    private val result = loader.loadClass("dev.forgesworn.qr.DecodeResult")
    private val inversion = loader.loadClass("dev.forgesworn.qr.Inversion")
    private val both = inversion.enumConstants.single { (it as Enum<*>).name == "BOTH" }
    private val decode = decoder.getMethod("decode", ByteArray::class.java, Int::class.javaPrimitiveType, Int::class.javaPrimitiveType, Int::class.javaPrimitiveType, inversion)

    init {
        for (type in listOf(decoder, result, inversion)) {
            check(type.classLoader === loader && File(type.protectionDomain.codeSource.location.toURI()).canonicalFile == jar.canonicalFile) {
                "Unexpected class source for ${type.name}"
            }
        }
    }

    fun read(frame: BenchFrame): Any? = try {
        decode.invoke(null, frame.data, frame.width, frame.height, frame.width, both)
    } catch (e: InvocationTargetException) {
        throw e.targetException
    }

    fun owns(value: Any?): Boolean = value == null || value.javaClass === result
}

private fun get(value: Any, property: String): Any? = value.javaClass.getMethod("get$property").invoke(value)

private fun point(value: Any?): Any? = value?.let {
    // Compare the actual IEEE-754 bits, including signed zero.
    listOf((get(it, "X") as Double).toBits(), (get(it, "Y") as Double).toBits())
}

private fun snapshot(value: Any?): Map<String, Any?>? {
    if (value == null) return null
    val location = get(value, "Location")
    val structured = get(value, "StructuredAppend")
    val fnc1 = get(value, "Fnc1")
    return linkedMapOf(
        "text" to get(value, "Text"), "bytes" to (get(value, "Bytes") as ByteArray).map { it.toInt() and 255 },
        "version" to get(value, "Version"), "ecc" to (get(value, "Ecc") as Enum<*>).name,
        "mask" to get(value, "Mask"), "eci" to get(value, "Eci"), "corrected" to get(value, "Corrected"),
        "mirrored" to get(value, "Mirrored"), "inverted" to get(value, "Inverted"),
        "location" to location?.let { listOf(point(get(it, "TopLeft")), point(get(it, "TopRight")), point(get(it, "BottomLeft")), point(get(it, "Alignment"))) },
        "structuredAppend" to structured?.let { listOf(get(it, "Index"), get(it, "Total"), get(it, "Parity")) },
        "fnc1" to fnc1?.let { listOf((get(it, "Position") as Enum<*>).name, get(it, "ApplicationIndicator")) },
    )
}

fun main(args: Array<String>) {
    require(args.size == 3) { "Supply baseline jar, current jar and output JSON filename" }
    val baseline = File(args[0]).canonicalFile
    val current = File(args[1]).canonicalFile
    require(baseline.isFile && current.isFile && baseline != current) { "Supply two distinct existing jars" }
    val allocations = (ManagementFactory.getThreadMXBean() as? com.sun.management.ThreadMXBean)?.takeIf { it.isThreadAllocatedMemorySupported }
    allocations?.isThreadAllocatedMemoryEnabled = true
    @Suppress("DEPRECATION")
    val thread = Thread.currentThread().id
    val rounds = 60
    val warmup = 200
    val loadBefore = ManagementFactory.getOperatingSystemMXBean().systemLoadAverage
    val gc = ManagementFactory.getGarbageCollectorMXBeans()
    val gcBefore = gc.associate { it.name to it.collectionCount }
    val rows = arrayListOf<Map<String, Any?>>()
    QrLoader(baseline).use { baselineLoader -> QrLoader(current).use { currentLoader ->
        val libraries = arrayOf(Library(baseline, baselineLoader), Library(current, currentLoader))
        for (frame in frames()) {
            val inputHash = hash(frame.data)
            val times = Array(2) { arrayListOf<Double>() }
            val allocated = Array(2) { arrayListOf<Long>() }
            val warmUntil = System.nanoTime() + 2_000_000_000L
            var iteration = 0
            var measured = 0
            while (measured < rounds) {
                val warming = iteration < warmup || System.nanoTime() < warmUntil
                val results = arrayOfNulls<Any>(2)
                for (which in if (iteration and 1 == 0) intArrayOf(0, 1) else intArrayOf(1, 0)) {
                    val before = allocations?.getThreadAllocatedBytes(thread)
                    val start = System.nanoTime()
                    results[which] = libraries[which].read(frame)
                    val elapsed = (System.nanoTime() - start) / 1e6
                    val after = allocations?.getThreadAllocatedBytes(thread)
                    if (!warming) {
                        times[which].add(elapsed)
                        if (before != null && after != null) allocated[which].add(after - before)
                    }
                }
                check(libraries.indices.all { libraries[it].owns(results[it]) }) { "Unexpected result class" }
                val a = snapshot(results[0])
                val b = snapshot(results[1])
                check(a == b) { "${frame.name}: old and current results differ: $a / $b" }
                check(a?.get("text") == frame.expected) { "${frame.name}: unexpected text" }
                if (frame.expected != null) check(a?.get("bytes") == frame.expected.toByteArray(Charsets.UTF_8).map { it.toInt() and 255 }) {
                    "${frame.name}: unexpected bytes"
                }
                iteration++
                if (!warming) measured++
            }
            check(hash(frame.data) == inputHash) { "${frame.name}: input changed" }
            fun summary(which: Int): Map<String, Any?> {
                val sorted = times[which].sorted()
                return linkedMapOf("medianMs" to sorted[rounds / 2], "p95Ms" to sorted[ceil(rounds * .95).toInt() - 1],
                    "medianAllocatedBytes" to allocated[which].sorted().takeIf { it.isNotEmpty() }?.get(rounds / 2),
                    "samplesMs" to times[which], "samplesAllocatedBytes" to allocated[which])
            }
            rows.add(linkedMapOf("name" to frame.name, "width" to frame.width, "height" to frame.height,
                "greySha256" to inputHash, "expectedText" to frame.expected, "warmupRounds" to iteration - rounds,
                "baseline" to summary(0), "current" to summary(1)))
        }
    } }
    val testRoot = File("kotlin/core/src/test/kotlin/dev/forgesworn/qr")
    val output = linkedMapOf(
        "revision" to command("git", "rev-parse", "HEAD"), "dirty" to command("git", "status", "--porcelain").isNotEmpty(),
        "baselineJar" to baseline.name, "baselineJarSha256" to hash(baseline.readBytes()),
        "currentJar" to current.name, "currentJarSha256" to hash(current.readBytes()),
        "frameHarnessSha256" to hash(testRoot.resolve("PerformanceMain.kt").readBytes()),
        "pairedHarnessSha256" to hash(testRoot.resolve("PairedPerformanceMain.kt").readBytes()),
        "gradleHarnessSha256" to hash(File("kotlin/core/build.gradle.kts").readBytes()),
        "javaVersion" to System.getProperty("java.runtime.version"), "javaVm" to System.getProperty("java.vm.name"),
        "jvmArguments" to ManagementFactory.getRuntimeMXBean().inputArguments,
        "arch" to System.getProperty("os.arch"), "os" to System.getProperty("os.name"),
        "cpu" to if (System.getProperty("os.name") == "Mac OS X") command("sysctl", "-n", "machdep.cpu.brand_string") else null,
        "heapBytes" to Runtime.getRuntime().maxMemory(), "loadBefore" to loadBefore,
        "loadAfter" to ManagementFactory.getOperatingSystemMXBean().systemLoadAverage,
        "gcCollectionsBefore" to gcBefore, "gcCollectionsAfter" to gc.associate { it.name to it.collectionCount },
        "minimumWarmupRounds" to warmup, "minimumWarmupSeconds" to 2, "rounds" to rounds,
        "validation" to "full result fields and coordinates, exact text and bytes; outside timing and allocation brackets", "rows" to rows,
    )
    File(args[2]).writeText(json(output) + "\n")
    println("Verified $rounds paired rounds per frame after at least $warmup warm-ups")
}
