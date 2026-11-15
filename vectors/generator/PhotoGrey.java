import java.awt.image.BufferedImage;
import java.awt.image.Raster;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.List;
import javax.imageio.ImageIO;

/**
 * Converts the downloaded photographs to 8-bit greyscale PNG, so the TypeScript and
 * Kotlin tests read exactly the same pixels. Standard library only (javax.imageio).
 *
 * Usage: PhotoGrey list.tsv rawDir greyDir
 * list.tsv has one photo a line, tab separated: id, extension, expected pixel SHA-256
 * or "-". Prints "id width height pixelSha256" for each photo.
 *
 * Grey rule: a one-band image keeps its samples; anything else is read as sRGB,
 * composited on white where it has alpha, and reduced to (299 R + 587 G + 114 B + 500) / 1000.
 */
public class PhotoGrey {
  public static void main(String[] args) throws Exception {
    List<String> lines = Files.readAllLines(Path.of(args[0]));
    int bad = 0;
    for (String line : lines) {
      if (line.isBlank()) continue;
      String[] f = line.split("\t");
      String id = f[0];
      File in = new File(args[1], id + "." + f[1]);
      BufferedImage img = ImageIO.read(in);
      if (img == null) {
        System.err.println("unreadable image: " + id);
        bad++;
        continue;
      }
      int w = img.getWidth();
      int h = img.getHeight();
      byte[] pixels = new byte[w * h];
      Raster raster = img.getRaster();
      boolean oneBand = raster.getNumBands() == 1 && img.getColorModel().getColorSpace().getNumComponents() == 1
          && img.getColorModel().getPixelSize() == 8;
      for (int y = 0; y < h; y++) {
        for (int x = 0; x < w; x++) {
          int v;
          if (oneBand) {
            v = raster.getSample(x, y, 0);
          } else {
            int argb = img.getRGB(x, y);
            int a = argb >>> 24;
            int r = (argb >> 16) & 255;
            int g = (argb >> 8) & 255;
            int b = argb & 255;
            if (a != 255) {
              r = (r * a + 255 * (255 - a) + 127) / 255;
              g = (g * a + 255 * (255 - a) + 127) / 255;
              b = (b * a + 255 * (255 - a) + 127) / 255;
            }
            v = (299 * r + 587 * g + 114 * b + 500) / 1000;
          }
          pixels[y * w + x] = (byte) v;
        }
      }
      BufferedImage grey = new BufferedImage(w, h, BufferedImage.TYPE_BYTE_GRAY);
      grey.getRaster().setDataElements(0, 0, w, h, pixels);
      File out = new File(args[2], id + ".png");
      if (!ImageIO.write(grey, "png", out)) throw new IllegalStateException("no PNG writer");
      // Reading it back is the check that the files the tests load hold these pixels.
      BufferedImage back = ImageIO.read(out);
      byte[] again = new byte[w * h];
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) again[y * w + x] = (byte) back.getRaster().getSample(x, y, 0);
      if (!java.util.Arrays.equals(pixels, again)) throw new IllegalStateException("round trip differs: " + id);
      String sum = hex(MessageDigest.getInstance("SHA-256").digest(pixels));
      System.out.println(id + " " + w + " " + h + " " + sum);
      if (!f[2].equals("-") && !f[2].equals(sum)) {
        boolean lossy = f[1].equals("jpg") || f[1].equals("jpeg");
        System.err.println((lossy ? "warning: " : "error: ") + "pixels differ from the recorded hash for " + id
            + (lossy ? " (JPEG decoding can vary between JDKs)" : ""));
        if (!lossy) bad++;
      }
    }
    if (bad > 0) System.exit(1);
  }

  private static String hex(byte[] bytes) {
    StringBuilder s = new StringBuilder();
    for (byte b : bytes) s.append(String.format("%02x", b));
    return s.toString();
  }
}
