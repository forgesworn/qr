// Writes vectors/encode-vectors.json from ZXing's QR encoder, used here only
// as an independent oracle at development time. Not part of the package.
// Run through scripts/generate-vectors.sh, which fetches and checks the jar.

import com.google.zxing.EncodeHintType;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.google.zxing.qrcode.decoder.Mode;
import com.google.zxing.qrcode.decoder.Version;
import com.google.zxing.qrcode.encoder.ByteMatrix;
import com.google.zxing.qrcode.encoder.Encoder;
import com.google.zxing.qrcode.encoder.QRCode;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

public final class GenerateVectors {
  private static final String[] LEVELS = {"L", "M", "Q", "H"};
  private static final String ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
  private static final String BYTE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-._~?=&/#";

  private record Case(String id, String text, String ecc, Integer version, Integer mask, boolean eci, String mode) {}

  public static void main(String[] args) throws Exception {
    List<Case> cases = new ArrayList<>();

    // Every version at full capacity, rotating mode, level and mask. Odd
    // versions leave the mask to the encoder, so mask choice is checked too.
    String[] modes = {"byte", "alphanumeric", "numeric"};
    for (int v = 1; v <= 40; v++) {
      String mode = modes[v % 3];
      String ecc = LEVELS[v % 4];
      Integer mask = v % 2 == 0 ? (v / 2) % 8 : null;
      cases.add(new Case("full-v" + v, fill(mode, v, ecc, v), ecc, v, mask, false, mode));
    }
    // Every mask at version 1 and at version 7 (the first with version information).
    for (int m = 0; m < 8; m++) {
      cases.add(new Case("mask" + m + "-v1", "HELLO WORLD", "Q", 1, m, false, "alphanumeric"));
      cases.add(new Case("mask" + m + "-v7", "https://example.com/" + "m".repeat(80), "M", 7, m, false, "byte"));
    }
    // Every level, version chosen by the encoder, across the count-length bands.
    String[] auto = {
      "", "0", "01", "012", "0123", "HELLO WORLD", "hello world", "A",
      "https://example.com/j/#" + "x".repeat(40),
      "https://example.com/j/#" + "x".repeat(300),
      "bunker://" + "a".repeat(64) + "?relay=wss%3A%2F%2Frelay.example&secret=test",
      "LNBC1" + "Q".repeat(250),
      "9".repeat(700),
    };
    for (int i = 0; i < auto.length; i++) {
      for (String ecc : LEVELS) {
        String mode = auto[i].isEmpty() ? "byte" : modeOf(auto[i]);
        cases.add(new Case("auto" + i + "-" + ecc, auto[i], ecc, null, null, false, mode));
      }
    }
    // Either side of the count-length band edges (versions 9/10 and 26/27).
    for (int v : new int[] {9, 10, 26, 27}) {
      cases.add(new Case("band-byte-v" + v, fill("byte", v, "L", 3), "L", v, null, false, "byte"));
    }
    // UTF-8 with an ECI designator.
    cases.add(new Case("eci-utf8", "KithMoot café ☕ 会議", "M", null, null, true, "byte"));
    cases.add(new Case("eci-ascii", "hello", "L", null, 3, true, "byte"));

    StringBuilder out = new StringBuilder();
    out.append("{\n  \"description\": \"QR encode vectors: module matrices produced by ZXing core 3.5.3 (Encoder.encode), no quiet zone. rows are hex, one string per row, most significant bit first, padded to whole bytes.\",\n");
    out.append("  \"vectors\": [\n");
    for (int i = 0; i < cases.size(); i++) {
      Case c = cases.get(i);
      Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
      if (c.version != null) hints.put(EncodeHintType.QR_VERSION, c.version);
      if (c.mask != null) hints.put(EncodeHintType.QR_MASK_PATTERN, c.mask);
      if (c.eci) hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
      else if (!StandardCharsets.US_ASCII.newEncoder().canEncode(c.text)) {
        throw new IllegalStateException(c.id + ": non-ASCII text needs eci");
      }
      QRCode qr = Encoder.encode(c.text, ErrorCorrectionLevel.valueOf(c.ecc), hints);
      String mode = switch (qr.getMode()) {
        case NUMERIC -> "numeric";
        case ALPHANUMERIC -> "alphanumeric";
        case BYTE -> "byte";
        default -> throw new IllegalStateException(c.id + ": mode " + qr.getMode());
      };
      if (!mode.equals(c.mode)) throw new IllegalStateException(c.id + ": expected " + c.mode + ", got " + mode);
      ByteMatrix m = qr.getMatrix();
      out.append("    {\"id\": ").append(json(c.id));
      out.append(", \"text\": ").append(json(c.text));
      out.append(", \"ecc\": ").append(json(c.ecc));
      out.append(", \"eci\": ").append(c.eci);
      out.append(", \"requestedVersion\": ").append(c.version);
      out.append(", \"requestedMask\": ").append(c.mask);
      out.append(", \"version\": ").append(qr.getVersion().getVersionNumber());
      out.append(", \"mask\": ").append(qr.getMaskPattern());
      out.append(", \"mode\": ").append(json(mode));
      out.append(", \"size\": ").append(m.getWidth());
      out.append(", \"rows\": [");
      for (int y = 0; y < m.getHeight(); y++) {
        StringBuilder row = new StringBuilder();
        for (int x = 0; x < m.getWidth(); x += 8) {
          int b = 0;
          for (int k = 0; k < 8; k++) b = (b << 1) | (x + k < m.getWidth() && m.get(x + k, y) == 1 ? 1 : 0);
          row.append(String.format("%02x", b));
        }
        out.append(y == 0 ? "" : ", ").append('"').append(row).append('"');
      }
      out.append("]}").append(i + 1 < cases.size() ? ",\n" : "\n");
    }
    out.append("  ]\n}\n");
    System.out.print(out);
  }

  private static String modeOf(String s) {
    boolean numeric = true;
    for (char ch : s.toCharArray()) {
      if (ch >= '0' && ch <= '9') continue;
      if (ALNUM.indexOf(ch) < 0) return "byte";
      numeric = false;
    }
    return numeric ? "numeric" : "alphanumeric";
  }

  /** The longest payload of the mode that fits, from a PRNG seeded with `seed`. */
  private static String fill(String mode, int v, String ecc, int seed) {
    Version version = Version.getVersionForNumber(v);
    int capacity = (version.getTotalCodewords()
        - version.getECBlocksForLevel(ErrorCorrectionLevel.valueOf(ecc)).getTotalECCodewords()) * 8;
    Mode m = switch (mode) {
      case "numeric" -> Mode.NUMERIC;
      case "alphanumeric" -> Mode.ALPHANUMERIC;
      default -> Mode.BYTE;
    };
    int countBits = m.getCharacterCountBits(version);
    int n = 0;
    while (4 + countBits + bitsFor(mode, n + 1) <= capacity && n + 1 < (1 << countBits)) n++;
    StringBuilder s = new StringBuilder();
    long x = seed * 2654435761L + 1;
    String alphabet = mode.equals("numeric") ? "0123456789" : mode.equals("alphanumeric") ? ALNUM : BYTE_CHARS;
    for (int i = 0; i < n; i++) {
      x = (x * 6364136223846793005L + 1442695040888963407L);
      s.append(alphabet.charAt((int) Long.remainderUnsigned(x >>> 33, alphabet.length())));
    }
    if (mode.equals("byte")) s.setCharAt(0, 'a');
    if (mode.equals("alphanumeric") && n > 0) s.setCharAt(0, 'A');
    return s.toString();
  }

  private static int bitsFor(String mode, int n) {
    return switch (mode) {
      case "numeric" -> (n / 3) * 10 + new int[] {0, 4, 7}[n % 3];
      case "alphanumeric" -> (n / 2) * 11 + (n % 2) * 6;
      default -> n * 8;
    };
  }

  private static String json(String s) {
    StringBuilder b = new StringBuilder("\"");
    for (char ch : s.toCharArray()) {
      if (ch == '"' || ch == '\\') b.append('\\').append(ch);
      else if (ch < 0x20 || ch > 0x7e) b.append(String.format("\\u%04x", (int) ch));
      else b.append(ch);
    }
    return b.append('"').toString();
  }
}
