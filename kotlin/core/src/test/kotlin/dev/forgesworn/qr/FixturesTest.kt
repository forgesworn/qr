package dev.forgesworn.qr

import java.io.File
import javax.imageio.ImageIO
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FixturesTest {
    private class Frame(val file: String, val text: String, val typescript: Boolean, val jsqr: Boolean)

    @Suppress("UNCHECKED_CAST")
    private fun frames(): List<Frame> {
        val root = readJsonObject(File(vectorsDir(), "decode-frames.json"))
        return (root["frames"] as List<Map<String, Any?>>).map {
            Frame(it["file"] as String, it["text"] as String, it["typescript"] as Boolean, it["jsqr"] as Boolean)
        }
    }

    private fun load(file: String): Grey {
        val image = ImageIO.read(File(File(vectorsDir(), "decode-frames"), file))
        val raster = image.raster
        val w = image.width
        val h = image.height
        val data = ByteArray(w * h)
        for (y in 0 until h) for (x in 0 until w) data[y * w + x] = raster.getSample(x, y, 0).toByte()
        return Grey(data, w, h)
    }

    @Test
    fun readsEveryFrameTheTypeScriptDecoderReads_andAtLeastAsManyAsZxing() {
        val all = frames()
        assertEquals(36, all.size)
        var kotlin = 0
        var zxing = 0
        var tsKnown = 0
        val misses = ArrayList<String>()
        val wrong = ArrayList<String>()
        for (f in all) {
            val g = load(f.file)
            val ours = decode(g.data, g.width, g.height)?.text == f.text
            val theirs = zxingRead(g) == f.text
            if (ours) kotlin++
            if (theirs) zxing++
            if (f.typescript) {
                tsKnown++
                if (!ours) wrong.add(f.file)
            }
            if (!ours) misses.add("${f.file}${if (theirs) " (ZXing read it)" else ""}${if (f.typescript) " (TypeScript read it)" else ""}")
        }
        val report = "fixtures: Kotlin $kotlin/${all.size}, ZXing $zxing/${all.size}, TypeScript marked $tsKnown\n" +
            misses.joinToString("\n") + "\n"
        println(report)
        File("build").mkdirs()
        File("build/fixture-score.txt").writeText(report)
        assertTrue("Frames the TypeScript decoder reads but Kotlin does not: $wrong", wrong.isEmpty())
        assertTrue("Kotlin read $kotlin, ZXing $zxing", kotlin >= zxing)
    }
}
