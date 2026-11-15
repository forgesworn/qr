// Writes vectors/encode-vectors.json from an independent encoder, used here
// only as a development-time oracle. Not part of the package. Run through
// scripts/generate-vectors.sh, which fetches and checks the jar.
//
// The class sits in the reference encoder's own package so that it can build
// a symbol from an explicit segment list with that encoder's package-private
// pieces: mode and count headers, segment data, terminator and padding,
// Reed-Solomon and interleaving, matrix layout and the four mask penalty
// rules. The segment list itself comes from segment() below, a separate
// implementation of SPEC.md's choice; it is not oracle-backed. Every
// single-segment case is also built by the reference encoder's public
// encode() and must match the segment-list build module for module.

package com.google.zxing.qrcode.encoder;

import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitArray;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.google.zxing.qrcode.decoder.Mode;
import com.google.zxing.qrcode.decoder.Version;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

public final class GenerateVectors {
  private static final String[] LEVELS = {"L", "M", "Q", "H"};
  private static final String ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
  private static final String BYTE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-._~?=&/#";
  private static final String BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  private static final String[] MODE_NAMES = {"numeric", "alphanumeric", "byte"};
  private static final Mode[] MODES = {Mode.NUMERIC, Mode.ALPHANUMERIC, Mode.BYTE};
  private static final int[][] COUNT_BITS = {{10, 12, 14}, {9, 11, 13}, {8, 16, 16}};

  /**
   * One symbol to generate. {@code expect} is the segment modes the case is
   * meant to show, comma separated, or "#n" for n segments; null for no check.
   */
  private record Case(String id, String text, String ecc, Integer version, Integer mask, boolean eci, String expect) {}

  private record Seg(int mode, String text) {
    int count() {
      return mode == 2 ? text.getBytes(StandardCharsets.UTF_8).length : text.length();
    }
  }

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

    // Mixed segments: each mode switch, then three modes, then a tie that
    // stays one segment (6 bytes cost the same as 3 bytes and 3 digits).
    String[][] mixed = {
      {"mixed-numeric-alphanumeric", "123456789012HELLO WORLD", "numeric,alphanumeric"},
      {"mixed-alphanumeric-numeric", "ORDER/20261115000123", "alphanumeric,numeric"},
      {"mixed-numeric-byte", "20261115 example order", "numeric,byte"},
      {"mixed-byte-numeric", "order no. 000123456789", "byte,numeric"},
      {"mixed-alphanumeric-byte", "HTTPS://EXAMPLE.COM/path?q=value&lang=en", "alphanumeric,byte"},
      {"mixed-byte-alphanumeric", "name: ABCDEFGHIJKLMNOPQRSTUVWXYZ", "byte,alphanumeric"},
      {"mixed-three-modes", "item ABCDEFGHIJKLMNOPQRST12345678901234567890", "byte,alphanumeric,numeric"},
      {"mixed-tie-one-segment", "abc123", "byte"},
    };
    for (int i = 0; i < mixed.length; i++) {
      cases.add(new Case(mixed[i][0], mixed[i][1], LEVELS[i % 4], null, i == 0 ? 5 : null, false, mixed[i][2]));
    }
    // Band edges where the optimum differs: six-digit runs in byte text split
    // off in versions 1-9 but not 10-26; eight-digit runs split off in 10-26
    // but not 27-40.
    String six = "abcdefgh123456";
    cases.add(new Case("mixed-band-v9-split", six.repeat(16), "L", null, null, false, "#32"));
    cases.add(new Case("mixed-band-v10-whole", six.repeat(17), "L", null, null, false, "byte,numeric"));
    cases.add(new Case("mixed-band-fixed-v10", six.repeat(16), "L", 10, null, false, "byte,numeric"));
    String eight = "abcdefgh12345678";
    cases.add(new Case("mixed-band-v26-split", eight.repeat(86), "L", null, null, false, "#172"));
    cases.add(new Case("mixed-band-v27-whole", eight.repeat(87), "L", null, null, false, "byte,numeric"));
    cases.add(new Case("mixed-band-fixed-v27", eight.repeat(86), "L", 27, null, false, "byte,numeric"));
    // Multi-byte UTF-8 around digit runs, without and with the ECI designator,
    // and the designator left out when no segment is byte.
    cases.add(new Case("mixed-utf8-digits", "Café ☕ 会議 réunion 2026-11-15 n° 0123456789 😀", "M", null, null, false,
        "byte,alphanumeric,byte,numeric,byte"));
    cases.add(new Case("mixed-eci-utf8", "Ünïcode 20261115123456 ÀÉÎ", "M", null, null, true, "byte,numeric,byte"));
    cases.add(new Case("mixed-eci-no-byte", "ORDER/20261115000123", "Q", null, null, true, "alphanumeric,numeric"));
    // Payment-URI shapes: a lowercase scheme before an uppercase body. Every
    // body is random from a fixed seed; none is a real invoice or address.
    String[][] payments = {
      {"pay-bolt11", "lightning:LNBC2500U1P" + random(BECH32, 330, 11).toUpperCase()},
      {"pay-bip21", "bitcoin:BC1Q" + random(BECH32, 38, 12).toUpperCase() + "?amount=0.00025000&lightning=LNBC2500U1P"
          + random(BECH32, 330, 13).toUpperCase()},
      {"pay-lnurl", "lightning:LNURL1" + random(BECH32, 180, 14).toUpperCase()},
      {"pay-gs1", "https://id.example.com/01/09506000134352/10/ABC123/21/000000012345"},
    };
    for (String[] p : payments) {
      for (String ecc : LEVELS) cases.add(new Case(p[0] + "-" + ecc, p[1], ecc, null, null, false, null));
    }

    StringBuilder out = new StringBuilder();
    out.append("{\n  \"description\": \"QR encode vectors: module matrices built by an independent reference encoder from the stated segment list (scripts/generate-vectors.sh), no quiet zone. rows are hex, one string per row, most significant bit first, padded to whole bytes. bits is the stream length before the terminator; reference is the reference encoder's own minimal segmentation (version and bits), for ASCII text without ECI.\",\n");
    out.append("  \"vectors\": [\n");
    int compared = 0;
    for (int i = 0; i < cases.size(); i++) {
      Case c = cases.get(i);
      ErrorCorrectionLevel level = ErrorCorrectionLevel.valueOf(c.ecc);
      int version = c.version != null ? c.version : chooseVersion(c.text, c.eci, level);
      List<Seg> segs = segment(c.text, band(version));
      checkExpectation(c, segs);
      Version ver = Version.getVersionForNumber(version);
      BitArray stream = stream(segs, c.eci, ver);
      int streamBits = stream.getSize();
      QRCode qr = build(stream, level, ver, c.mask);
      boolean ascii = StandardCharsets.US_ASCII.newEncoder().canEncode(c.text);
      if (segs.size() == 1 && (ascii || c.eci)) {
        compareWithPublicEncode(c, qr);
        compared++;
      }
      String reference = "null";
      if (ascii && !c.eci && !c.text.isEmpty()) {
        MinimalEncoder.ResultList minimal = MinimalEncoder.encode(c.text, c.version == null ? null : ver, null, false, level);
        reference = "{\"version\": " + minimal.getVersion().getVersionNumber() + ", \"bits\": " + minimal.getSize() + "}";
        if (minimal.getSize() != streamBits) System.err.println(c.id + ": reference minimal is " + minimal.getSize() + " bits, ours " + streamBits);
      }
      ByteMatrix m = qr.getMatrix();
      int widest = 0;
      for (Seg s : segs) widest = Math.max(widest, s.mode);
      out.append("    {\"id\": ").append(json(c.id));
      out.append(", \"text\": ").append(json(c.text));
      out.append(", \"ecc\": ").append(json(c.ecc));
      out.append(", \"eci\": ").append(c.eci);
      out.append(", \"requestedVersion\": ").append(c.version);
      out.append(", \"requestedMask\": ").append(c.mask);
      out.append(", \"version\": ").append(version);
      out.append(", \"mask\": ").append(qr.getMaskPattern());
      out.append(", \"mode\": ").append(json(MODE_NAMES[widest]));
      out.append(", \"segments\": [");
      for (int k = 0; k < segs.size(); k++) {
        out.append(k == 0 ? "" : ", ").append("{\"mode\": ").append(json(MODE_NAMES[segs.get(k).mode]))
            .append(", \"count\": ").append(segs.get(k).count()).append('}');
      }
      out.append("], \"bits\": ").append(streamBits);
      out.append(", \"reference\": ").append(reference);
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
    System.err.println(cases.size() + " vectors; " + compared + " also matched the public encode()");
  }

  // ---- The segmentation SPEC.md defines (Mode), written separately from the ports.

  private static int band(int version) {
    return version <= 9 ? 0 : version <= 26 ? 1 : 2;
  }

  private static int kind(int cp) {
    if (cp >= '0' && cp <= '9') return 0;
    return cp < 0x80 && ALNUM.indexOf(cp) >= 0 ? 1 : 2;
  }

  /** Bits a character adds to a segment of {@code mode} that already holds {@code held} characters. */
  private static int charBits(int mode, int held, int utf8Length) {
    if (mode == 0) return held % 3 == 0 ? 4 : 3;
    if (mode == 1) return held % 2 == 0 ? 6 : 5;
    return 8 * utf8Length;
  }

  /**
   * Fewest bits, then fewest segments, then at the first character where two
   * choices differ the mode earlier in numeric, alphanumeric, byte. States are
   * (open mode, characters held modulo 3 or 2), so every cost is whole bits.
   * best[i][state] is the (bits, segments) cost of characters i.. from that state.
   */
  private static List<Seg> segment(String text, int band) {
    List<Seg> out = new ArrayList<>();
    if (text.isEmpty()) {
      out.add(new Seg(2, ""));
      return out;
    }
    int[] cps = text.codePoints().toArray();
    int n = cps.length;
    // state: 0 nothing open; 1 + mode * 3 + phase, phase = held % 3 (numeric), % 2 (alphanumeric), 0 (byte)
    int states = 10;
    long[][] best = new long[n + 1][states];
    for (int i = n - 1; i >= 0; i--) {
      for (int s = 0; s < states; s++) {
        long min = Long.MAX_VALUE;
        for (int m = kind(cps[i]); m < 3; m++) min = Math.min(min, cost(cps, i, s, m, band) + best[i + 1][after(s, m)]);
        best[i][s] = min;
      }
    }
    int s = 0;
    StringBuilder run = new StringBuilder();
    int runMode = -1;
    for (int i = 0; i < n; i++) {
      int m = kind(cps[i]);
      while (cost(cps, i, s, m, band) + best[i + 1][after(s, m)] != best[i][s]) m++;
      if (m != runMode) {
        if (runMode >= 0) out.add(new Seg(runMode, run.toString()));
        run.setLength(0);
        runMode = m;
      }
      run.appendCodePoint(cps[i]);
      s = after(s, m);
    }
    out.add(new Seg(runMode, run.toString()));
    return out;
  }

  private static long cost(int[] cps, int i, int state, int mode, int band) {
    int open = state == 0 ? -1 : (state - 1) / 3;
    int phase = state == 0 ? 0 : (state - 1) % 3;
    int length = new String(Character.toChars(cps[i])).getBytes(StandardCharsets.UTF_8).length;
    if (open == mode) return (long) charBits(mode, phase, length) << 16;
    return ((long) (4 + COUNT_BITS[mode][band] + charBits(mode, 0, length)) << 16) + 1;
  }

  private static int after(int state, int mode) {
    int open = state == 0 ? -1 : (state - 1) / 3;
    int phase = open == mode ? (state - 1) % 3 : 0;
    int modulus = mode == 0 ? 3 : mode == 1 ? 2 : 1;
    return 1 + mode * 3 + (phase + 1) % modulus;
  }

  private static int streamBits(List<Seg> segs, boolean eci, int band) {
    int total = 0;
    boolean hasByte = false;
    for (Seg s : segs) {
      int count = s.count();
      if (count >= 1 << COUNT_BITS[s.mode][band]) return Integer.MAX_VALUE;
      int data = s.mode == 0 ? count / 3 * 10 + new int[] {0, 4, 7}[count % 3]
          : s.mode == 1 ? count / 2 * 11 + count % 2 * 6 : count * 8;
      total += 4 + COUNT_BITS[s.mode][band] + data;
      hasByte |= s.mode == 2;
    }
    return total + (eci && hasByte ? 12 : 0);
  }

  private static int chooseVersion(String text, boolean eci, ErrorCorrectionLevel level) {
    for (int v = 1; v <= 40; v++) {
      int bits = streamBits(segment(text, band(v)), eci, band(v));
      Version ver = Version.getVersionForNumber(v);
      if (bits <= (ver.getTotalCodewords() - ver.getECBlocksForLevel(level).getTotalECCodewords()) * 8) return v;
    }
    throw new IllegalStateException("does not fit: " + text);
  }

  private static void checkExpectation(Case c, List<Seg> segs) {
    if (c.expect == null) return;
    StringBuilder got = new StringBuilder();
    for (Seg s : segs) got.append(got.length() == 0 ? "" : ",").append(MODE_NAMES[s.mode]);
    boolean ok = c.expect.startsWith("#") ? Integer.parseInt(c.expect.substring(1)) == segs.size() : c.expect.contentEquals(got);
    if (!ok) throw new IllegalStateException(c.id + ": expected " + c.expect + ", got " + got);
  }

  // ---- Building with the reference encoder's own pieces.

  /** Header and data bits: one ECI designator first if asked for and any segment is byte, then each segment. */
  private static BitArray stream(List<Seg> segs, boolean eci, Version version) throws WriterException {
    BitArray bits = new BitArray();
    boolean hasByte = segs.stream().anyMatch(s -> s.mode == 2);
    if (eci && hasByte) {
      Encoder.appendModeInfo(Mode.ECI, bits);
      bits.appendBits(26, 8);
    }
    for (Seg s : segs) {
      Encoder.appendModeInfo(MODES[s.mode], bits);
      Encoder.appendLengthInfo(s.count(), version, MODES[s.mode], bits);
      Encoder.appendBytes(s.text, MODES[s.mode], bits, StandardCharsets.UTF_8);
    }
    return bits;
  }

  private static QRCode build(BitArray stream, ErrorCorrectionLevel level, Version version, Integer mask) throws WriterException {
    Version.ECBlocks ec = version.getECBlocksForLevel(level);
    int numDataBytes = version.getTotalCodewords() - ec.getTotalECCodewords();
    if (stream.getSize() > numDataBytes * 8) throw new IllegalStateException("stream does not fit version " + version);
    BitArray bits = new BitArray();
    bits.appendBitArray(stream);
    Encoder.terminateBits(numDataBytes, bits);
    BitArray finalBits = Encoder.interleaveWithECBytes(bits, version.getTotalCodewords(), numDataBytes, ec.getNumBlocks());
    int dimension = version.getDimensionForVersion();
    int chosen = mask == null ? -1 : mask;
    if (mask == null) {
      int min = Integer.MAX_VALUE;
      for (int m = 0; m < QRCode.NUM_MASK_PATTERNS; m++) {
        ByteMatrix trial = new ByteMatrix(dimension, dimension);
        MatrixUtil.buildMatrix(finalBits, level, version, m, trial);
        int penalty = MaskUtil.applyMaskPenaltyRule1(trial) + MaskUtil.applyMaskPenaltyRule2(trial)
            + MaskUtil.applyMaskPenaltyRule3(trial) + MaskUtil.applyMaskPenaltyRule4(trial);
        if (penalty < min) {
          min = penalty;
          chosen = m;
        }
      }
    }
    ByteMatrix matrix = new ByteMatrix(dimension, dimension);
    MatrixUtil.buildMatrix(finalBits, level, version, chosen, matrix);
    QRCode qr = new QRCode();
    qr.setECLevel(level);
    qr.setVersion(version);
    qr.setMaskPattern(chosen);
    qr.setMatrix(matrix);
    return qr;
  }

  /** The reference encoder's public, single-segment encode() must give the same symbol. */
  private static void compareWithPublicEncode(Case c, QRCode built) throws WriterException {
    Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
    if (c.version != null) hints.put(EncodeHintType.QR_VERSION, c.version);
    if (c.mask != null) hints.put(EncodeHintType.QR_MASK_PATTERN, c.mask);
    if (c.eci) hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
    QRCode qr = Encoder.encode(c.text, ErrorCorrectionLevel.valueOf(c.ecc), hints);
    if (qr.getVersion().getVersionNumber() != built.getVersion().getVersionNumber()
        || qr.getMaskPattern() != built.getMaskPattern() || !qr.getMatrix().toString().equals(built.getMatrix().toString())) {
      throw new IllegalStateException(c.id + ": segment-list build differs from the public encode()");
    }
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

  /** {@code n} characters from {@code alphabet}, from a PRNG seeded with {@code seed}. */
  private static String random(String alphabet, int n, int seed) {
    StringBuilder s = new StringBuilder();
    long x = seed * 2654435761L + 1;
    for (int i = 0; i < n; i++) {
      x = (x * 6364136223846793005L + 1442695040888963407L);
      s.append(alphabet.charAt((int) Long.remainderUnsigned(x >>> 33, alphabet.length())));
    }
    return s.toString();
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
    String alphabet = mode.equals("numeric") ? "0123456789" : mode.equals("alphanumeric") ? ALNUM : BYTE_CHARS;
    StringBuilder s = new StringBuilder(random(alphabet, n, seed));
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
