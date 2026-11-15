package dev.forgesworn.qr

import java.io.File
import java.security.MessageDigest
import javax.imageio.ImageIO
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Real photographs with known contents, listed in vectors/photos.json. The images are
 * not committed: `npm run fetch-photos` downloads them into vectors/photos-cache/ and
 * converts them to 8-bit greyscale. Without that cache this test skips.
 *
 * Expected text is read at run time from the hash-pinned .txt files in the cache and
 * compared exactly (UTF-8, no trimming, no newline normalisation). Failures name the
 * photograph, never the expected text.
 */
class PhotosTest {
    private class Photo(val id: String, val textSha256: String, val typescript: Boolean)

    @Suppress("UNCHECKED_CAST")
    private fun photos(): List<Photo> {
        val root = readJsonObject(File(vectorsDir(), "photos.json"))
        return (root["photos"] as List<Map<String, Any?>>).map {
            Photo(it["id"] as String, it["textSha256"] as String, it["typescript"] as Boolean)
        }
    }

    private fun expected(raw: File, p: Photo): String {
        val bytes = File(raw, "${p.id}.txt").readBytes()
        val sum = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
        check(sum == p.textSha256) { "expected-text file for ${p.id} does not match its hash; run npm run fetch-photos" }
        return String(bytes, Charsets.UTF_8)
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
        val cache = File(vectorsDir(), "photos-cache")
        val grey = File(cache, "grey")
        val raw = File(cache, "raw")
        val cached = all.isNotEmpty() && all.all { File(grey, "${it.id}.png").exists() && File(raw, "${it.id}.txt").exists() }
        if (System.getenv("QR_REQUIRE_PHOTOS") == "1") {
            assertTrue("photograph cache required: run npm run fetch-photos", cached)
        }
        assumeTrue("photograph cache absent: run npm run fetch-photos", cached)
        var kotlin = 0
        var reference = 0
        var tsKnown = 0
        val lost = ArrayList<String>()
        val wrong = ArrayList<String>()
        val misses = ArrayList<String>()
        for (p in all) {
            val want = expected(raw, p)
            val g = load(File(grey, "${p.id}.png"))
            val ours = decode(g.data, g.width, g.height)?.text
            val theirs = zxingRead(g) == want
            if (ours == want) kotlin++
            if (theirs) reference++
            if (p.typescript) tsKnown++
            if (ours != null && ours != want) wrong.add(p.id)
            if (p.typescript && ours != want) lost.add(p.id)
            if (ours != want) misses.add("${p.id}${if (theirs) " (reference decoder read it)" else ""}${if (p.typescript) " (TypeScript read it)" else ""}")
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
