package dev.forgesworn.qr

import java.io.File
import javax.imageio.ImageIO
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Real photographs with known contents, listed in vectors/photos.json. The images are
 * not committed: `npm run fetch-photos` downloads them into vectors/photos-cache/ and
 * converts them to 8-bit greyscale. Without that cache this test skips.
 *
 * Expected text is compared exactly as stored (no trimming, no newline normalisation).
 */
class PhotosTest {
    private class Photo(val id: String, val text: String, val typescript: Boolean)

    @Suppress("UNCHECKED_CAST")
    private fun photos(): List<Photo> {
        val root = readJsonObject(File(vectorsDir(), "photos.json"))
        return (root["photos"] as List<Map<String, Any?>>).map {
            Photo(it["id"] as String, it["text"] as String, it["typescript"] as Boolean)
        }
    }

    private fun load(file: File): Grey {
        val image = ImageIO.read(file)
        val raster = image.raster
        val w = image.width
        val h = image.height
        val data = ByteArray(w * h)
        for (y in 0 until h) for (x in 0 until w) data[y * w + x] = raster.getSample(x, y, 0).toByte()
        return Grey(data, w, h)
    }

    @Test
    fun readsEveryPhotographTheTypeScriptDecoderReads_neverTheWrongText() {
        val all = photos()
        val grey = File(File(vectorsDir(), "photos-cache"), "grey")
        assumeTrue("photograph cache absent: run npm run fetch-photos", all.isNotEmpty() && all.all { File(grey, "${it.id}.png").exists() })
        var kotlin = 0
        var reference = 0
        var tsKnown = 0
        val lost = ArrayList<String>()
        val wrong = ArrayList<String>()
        val misses = ArrayList<String>()
        for (p in all) {
            val g = load(File(grey, "${p.id}.png"))
            val ours = decode(g.data, g.width, g.height)?.text
            val theirs = zxingRead(g) == p.text
            if (ours == p.text) kotlin++
            if (theirs) reference++
            if (p.typescript) tsKnown++
            if (ours != null && ours != p.text) wrong.add(p.id)
            if (p.typescript && ours != p.text) lost.add(p.id)
            if (ours != p.text) misses.add("${p.id}${if (theirs) " (reference decoder read it)" else ""}${if (p.typescript) " (TypeScript read it)" else ""}")
        }
        val report = "photographs: Kotlin $kotlin/${all.size}, reference decoder $reference/${all.size}, TypeScript baseline $tsKnown\n" +
            misses.joinToString("\n") + "\n"
        println(report)
        File("build").mkdirs()
        File("build/photo-score.txt").writeText(report)
        assertTrue("Wrong text for: $wrong", wrong.isEmpty())
        assertTrue("Photographs the TypeScript decoder reads but Kotlin does not: $lost", lost.isEmpty())
    }
}
