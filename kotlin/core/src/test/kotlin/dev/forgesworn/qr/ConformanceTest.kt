package dev.forgesworn.qr

import java.io.File
import java.security.MessageDigest
import javax.imageio.ImageIO
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The conformance pack (vectors/conformance.json, described in
 * vectors/README.md): what any port checks itself against. This port reads
 * the file the TypeScript decoder generated and must agree on every stage,
 * result and work count.
 */
@Suppress("UNCHECKED_CAST")
class ConformanceTest {
    private val pack = readJsonObject(File(vectorsDir(), "conformance.json"))

    private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    private fun unhex(s: String): ByteArray = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }

    private fun sha(bytes: ByteArray): String = hex(MessageDigest.getInstance("SHA-256").digest(bytes))

    private fun bytesOf(values: IntArray): ByteArray = ByteArray(values.size) { values[it].toByte() }

    private fun number(v: Any?): Double = (v as Number).toDouble()

    private fun load(file: String): Grey {
        val image = ImageIO.read(File(vectorsDir(), file))
        val raster = image.raster
        val w = image.width
        val h = image.height
        val data = ByteArray(w * h)
        for (y in 0 until h) for (x in 0 until w) data[y * w + x] = raster.getSample(x, y, 0).toByte()
        return Grey(data, w, h)
    }

    /** A result against its record: the fields a module grid gives. */
    private fun same(name: String, want: Map<String, Any?>?, got: DecodeResult?) {
        if (want == null) {
            assertNull(name, got)
            return
        }
        assertNotNull(name, got)
        got!!
        assertEquals(name, want["bytes"], hex(got.bytes))
        assertEquals(name, want["text"], got.text)
        assertEquals(name, (want["version"] as Number).toInt(), got.version)
        assertEquals(name, want["ecc"], got.ecc.name)
        assertEquals(name, (want["mask"] as Number).toInt(), got.mask)
        assertEquals(name, (want["eci"] as List<Number>).map { it.toInt() }, got.eci)
        assertEquals(name, (want["corrected"] as Number).toInt(), got.corrected)
        assertEquals(name, want["mirrored"], got.mirrored)
    }

    @Test
    fun holdsTheTablesOfEveryVersion() {
        val tables = pack["tables"] as Map<String, Any?>
        val blocks = (tables["blocks"] as List<List<List<Number>>>).map { levels -> levels.map { b -> b.map { it.toInt() } } }
        val alignment = (tables["alignment"] as List<List<Number>>).map { c -> c.map { it.toInt() } }
        assertEquals(EC_BLOCKS.map { levels -> levels.map { it.toList() } }, blocks)
        assertEquals(ALIGNMENT_CENTRES.map { it.toList() }, alignment)
    }

    @Test
    fun convertsArgbToGreyscaleAsRecorded() {
        for (v in pack["luminance"] as List<Map<String, Any?>>) {
            val width = (v["width"] as Number).toInt()
            val height = (v["height"] as Number).toInt()
            val rgba = unhex(v["rgba"] as String)
            val argb = IntArray(width * height) {
                val r = rgba[4 * it].toInt() and 0xff
                val g = rgba[4 * it + 1].toInt() and 0xff
                val b = rgba[4 * it + 2].toInt() and 0xff
                val a = rgba[4 * it + 3].toInt() and 0xff
                (a shl 24) or (r shl 16) or (g shl 8) or b
            }
            assertEquals("$width x $height", v["grey"], hex(bytesOf(toLuminance(argb, width, height, width).data)))
        }
    }

    @Test
    fun readsEveryModuleGridAsRecorded() {
        val symbols = pack["symbols"] as List<Map<String, Any?>>
        assertTrue(symbols.size >= 13)
        for (v in symbols) {
            val size = (v["size"] as Number).toInt()
            val rows = v["rows"] as List<String>
            val modules = ByteArray(size * size)
            for (y in 0 until size) {
                val row = unhex(rows[y])
                for (x in 0 until size) modules[y * size + x] = ((row[x shr 3].toInt() shr (7 - (x and 7))) and 1).toByte()
            }
            same(v["name"] as String, v["result"] as Map<String, Any?>?, decodeModules(modules, size))
        }
    }

    @Test
    fun givesEveryRecordedStageResultAndWorkCountForEachPicture() {
        val frames = pack["frames"] as List<Map<String, Any?>>
        assertTrue(frames.size >= 58)
        for (v in frames) {
            val file = v["file"] as String
            val g = load(file)
            assertEquals(file, (v["width"] as Number).toInt(), g.width)
            assertEquals(file, (v["height"] as Number).toInt(), g.height)
            val luminance = toLuminance(g.data, g.width, g.height, g.width)
            assertEquals("$file luminance", v["luminance"], sha(bytesOf(luminance.data)))
            val bits = binarise(luminance)
            assertEquals("$file bits", v["bits"], sha(bits.data))
            val reduced = v["reduced"] as Map<String, Any?>
            for (f in intArrayOf(2, 4, 8)) {
                val want = reduced["$f"]
                val got = if (g.width / f >= 1 && g.height / f >= 1) sha(bytesOf(shrink(luminance, f).data)) else null
                assertEquals("$file shrunk by $f", want, got)
            }
            val finders = v["finders"] as Map<String, Any?>
            val triples = v["triples"] as Map<String, Any?>
            for ((key, tolerance) in listOf("0.5" to 0.5, "0.8" to 0.8)) {
                val want = (finders[key] as List<List<Any?>>).map { row -> row.map { number(it) } }
                val found = findFinders(bits, tolerance)
                assertEquals("$file finders at $key", want, found.map { listOf(it.x, it.y, it.moduleSize, it.count.toDouble()) })
                val three = finderTriples(bits, found)
                val wantTriples = (triples[key] as List<Map<String, Any?>>).map {
                    (it["finders"] as List<Number>).map { n -> n.toInt() } to (it["size"] as Number?)?.toInt()
                }
                assertEquals("$file triples at $key", wantTriples, three.map { t -> t.map { f -> found.indexOf(f) } to estimateSize(bits, t) })
                if (key == "0.5" && three.isNotEmpty()) {
                    val wantPlacements = (v["placements"] as List<Map<String, Any?>>).map {
                        Triple(
                            (it["size"] as Number).toInt(),
                            (it["alignment"] as List<Any?>?)?.let { p -> Point(number(p[0]), number(p[1])) },
                            (it["matrix"] as List<Any?>).map { m -> (m as Number?)?.toDouble() },
                        )
                    }
                    val gotPlacements = locate(bits, three[0]).map { l ->
                        Triple(l.size, l.alignment, l.matrix!!.map { m -> if (m.isFinite()) m else null })
                    }
                    assertEquals("$file placements", wantPlacements, gotPlacements)
                }
            }
            if ((triples["0.5"] as List<Any?>).isEmpty()) assertTrue("$file placements", (v["placements"] as List<Any?>).isEmpty())
            val work = Work()
            val got = decodeCounted(g.data, g.width, g.height, work)
            val want = v["result"] as Map<String, Any?>?
            same(file, want, got)
            if (want != null) {
                assertEquals(file, want["inverted"], got!!.inverted)
                val location = want["location"] as Map<String, Any?>
                fun point(key: String): Point? = (location[key] as List<Any?>?)?.let { Point(number(it[0]), number(it[1])) }
                assertEquals("$file top left", point("topLeft"), got.location!!.topLeft)
                assertEquals("$file top right", point("topRight"), got.location!!.topRight)
                assertEquals("$file bottom left", point("bottomLeft"), got.location!!.bottomLeft)
                assertEquals("$file alignment", point("alignment"), got.location!!.alignment)
            }
            val counted = v["work"] as Map<String, Any?>
            val mine = mapOf(
                "steps" to work.steps, "compared" to work.compared, "scanned" to work.scanned, "maps" to work.maps,
                "second" to work.second, "meshes" to work.meshes, "probed" to work.probed, "reduced" to work.reduced,
            )
            assertEquals("$file work", counted.mapValues { (it.value as Number).toLong() }, mine)
        }
    }
}
