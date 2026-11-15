# Specification

This is what every implementation of `@forgesworn/qr` (TypeScript now,
Kotlin and Rust later) must do, so that the same input gives the same
symbol byte for byte. `vectors/encode-vectors.json` is the test of it.
Section numbers refer to ISO/IEC 18004:2015.

## Input

- Text is a sequence of Unicode code points; lone surrogates become
  U+FFFD. Byte segments carry the UTF-8 of their code points, so no
  segment boundary falls inside a character.
- Bytes are encoded as given, always as one byte segment.

## Mode

Bytes, text with a mode named by the caller, and the empty string are one
segment: bytes and the empty string in byte mode (the empty string as a
byte segment of count 0), named-mode text in that mode, which must hold
every character. Kanji mode is not produced.

Other text is split into numeric, alphanumeric and byte segments with
the fewest bits, worked out exactly in whole bits as follows.

- A digit `0-9` may go in any mode; any other character of
  `A-Z space $ % * + - . / :` in alphanumeric or byte; anything else in
  byte only.
- A segment costs 4 bits of mode indicator, the count field (width by
  version band below), and its data: numeric `10 * floor(n / 3)` plus 0,
  4 or 7 for `n mod 3` = 0, 1, 2; alphanumeric `11 * floor(n / 2)` plus 6
  if `n` is odd; byte 8 per UTF-8 byte. `n` is the segment's characters
  (bytes in byte mode).
- Count field widths are numeric 10, 12, 14; alphanumeric 9, 11, 13; byte
  8, 16, 16 for versions 1-9, 10-26 and 27-40. The segmentation is chosen
  for one band at a time, and a symbol uses the one for its version's
  band, a fixed version included: the same text can split differently at
  versions 9 and 10, or 26 and 27.
- The ECI designator (below) is left out of the cost. It appears only
  with a byte segment, and a fewest-bits segmentation has a byte segment
  only when some character is outside the alphanumeric set, when every
  segmentation has one; so it cannot change the choice.
- Count field limits never bind: a segment whose count overflows its
  field cannot fit the capacity of any version in that band.

Among the segmentations with the fewest bits, the one chosen has the
fewest segments; among those, the one whose mode per character, read from
the start, is earliest in the order numeric, alphanumeric, byte at the
first character where two differ. Adjacent segments never share a mode.
The result is unique, so every port gives the same segment list and bit
stream. Some consequences: `abc123` is one byte segment (byte `abc` plus
numeric `123` costs the same 60 bits at versions 1-9, but takes two
segments); a run of six or seven digits between byte characters splits
off at versions 1-9 only, and a run of eight at versions 1-26 only.

The symbol reports its segments in order, each as a mode and a count, and
its `mode` as the widest among them: byte if any segment is byte, else
alphanumeric if any is, else numeric. For text that needs no named mode
this is the mode the encoder used before it mixed segments.

With `eci: true` and at least one byte segment, the stream starts with
one ECI designator, `0111` and assignment 26 (UTF-8) as 8 bits (section
7.4.2), before the first segment, whatever its mode. It covers every
byte segment after it. A symbol with no byte segment never carries one.

## Version and level

Level M unless the caller names one. The version is the smallest, from
`minVersion` (default 1), whose data capacity holds the stream (ECI if
any, then every segment's header and data) for the segmentation of that
version's band. A requested version that cannot hold the data is an
error, never a silent upgrade. A requested version below `minVersion` is
an argument error (`RangeError`, `IllegalArgumentException` in Kotlin),
not a capacity error.

## Bit stream and error correction

The segments in order, each its 4-bit mode indicator (numeric `0001`,
alphanumeric `0010`, byte `0100`), count and data (section 7.4.3 to
7.4.5), after the ECI designator if there is one. Then a terminator of
up to four zero bits, zero bits to a byte boundary, then
pad bytes `0xEC`, `0x11` alternately (section 7.4.10). Codewords split into
blocks as Table 9 gives (group 2 blocks hold one more data codeword);
Reed-Solomon over GF(256) with polynomial `0x11D`, generator roots
`α^0 .. α^(n-1)`. Data codewords are interleaved by index across blocks,
then error correction codewords the same way.

## Matrix

Finder patterns with separators, the dark module at (8, size - 8),
alignment patterns at every pair of Annex E centres except those on a
finder, timing patterns on row and column 6, then format and version
areas reserved. Data fills two-module columns from the bottom right,
upward first, skipping column 6 and every reserved module; remainder
bits are light before masking.

Format information is `(level bits << 3 | mask)` with level bits L=01,
M=00, Q=11, H=10, BCH(15,5) with generator `0x537`, XOR `0x5412`. Bit
`i` (least significant first) goes at the i-th of (8,0) (8,1) (8,2) (8,3)
(8,4) (8,5) (8,7) (8,8) (7,8) (5,8) (4,8) (3,8) (2,8) (1,8) (0,8), as
(x, y), and again at (size - 1 - i, 8) for `i < 8` or (8, size - 15 + i)
otherwise. Version information (version 7 and up) is BCH(18,6) with
generator `0x1F25`; bit `k` (least significant first) goes at
(k / 3, size - 11 + k % 3) and its transpose.

## Mask

Unless the caller names one, every mask 0-7 is applied to the finished
symbol (format and version information included) and scored with the four
penalty rules of section 7.8.3: N1 = 3 per run of five or more same-colour
modules plus one per module beyond five, rows and columns; N2 = 3 per 2x2
same-colour block, overlapping; N3 = 40 per `1011101` with four light
modules before or after, rows and columns; N4 = 10 per whole 5 per cent
that dark modules deviate from half, rounded down. The lowest score wins;
ties go to the lower mask.

One choice the standard leaves open: for N3, four light modules that would
lie outside the symbol do not count (the quiet zone is not scored). ZXing
makes the same choice, so masks chosen here match it.

## Output

A square of `17 + 4 * version` modules, row-major, 1 for dark, with no
quiet zone. Renderers add the quiet zone; the default is four modules.
`isDark(x, y)` is false for any coordinate outside the square, negative,
too large or (in TypeScript) not an integer, as the quiet zone is light.

Renderers are not covered by the vectors and need not match byte for byte
across ports, but must keep these properties: the quiet zone is light;
a canvas or bitmap renderer puts module edges on whole pixels (edge of
module `i` at `round(i * width / side)`); a terminal renderer packs two
module rows per line with U+2580 (upper half), U+2584 (lower half), U+2588
(full) and space, inking light modules by default.

## Vectors

`vectors/encode-vectors.json` holds 147 symbols produced with an
independent reference encoder, pinned by version and hash in
`scripts/generate-vectors.sh`. Each gives the input and options, the
version, mask, widest mode, segment list, stream length in bits before
the terminator, and the module rows. They cover every version at full
capacity, every mask, every level, all three modes, both count field
band edges, the empty string, UTF-8 with ECI, every ordered pair of
modes in a mixed stream, three modes in one stream, ties, mixed
segments either side of versions 9/10 and 26/27 (chosen and fixed),
multi-byte UTF-8 with digit runs, ECI with and without a byte segment,
and payment-URI shapes at every level. The reference encoder is a
development-time oracle only and is not part of the package.

What the oracle backs, and what it does not:

- Oracle-backed: given a segment list, the bit stream (mode indicators,
  count fields, data encoding), terminator, padding, Reed-Solomon
  blocks, interleaving, matrix and mask penalties come from the
  reference encoder's own routines, called from a generator compiled into
  its encoder package. The ECI designator and the loop over masks are
  written in the generator, as those routines are private. Every
  single-segment symbol (all are ASCII or use ECI) also matches the
  reference encoder's public encode call module for module.
- Not oracle-backed: the segment lists. The generator works them out with
  its own implementation of the rule above, written apart from either
  port. They are checked independently: against every per-character mode
  assignment for short strings in all three bands; against a search over
  every segment boundary for every vector text up to 1500 characters and
  for random text of about 300 characters;
  against the reference encoder's own minimal-segmentation mode for ASCII
  text without ECI (never more bits nor a larger version, and fewer bits
  on one vector, `mixed-three-modes`, 254 against 256); and by an
  independent decoder reading mixed symbols back, with and without ECI.
- The choice among segmentations with equal bits (the tie-breaks) is this
  specification's own; only the bit count and version are compared with
  the reference encoder's minimal mode, which need not break ties the
  same way.

## Decoder

The decoder is not bound by the vectors in the same way: ports may find
codes differently, but must return the same payload for any symbol they
read. The TypeScript pipeline, for reference:

1. Luminance: RGBA to grey as `(77 R + 150 G + 29 B) >> 8`, with alpha
   blended onto white, so a code drawn on a transparent canvas reads.
2. Binarisation: 8x8 blocks; each block's threshold is the mean of the
   block averages in the 5x5 blocks around it; a block with a range of 24
   or less borrows its neighbours' level. Pictures under 40 pixels a side
   use one global threshold.
3. Finders: row scans for 1:1:3:1:1 runs, each checked down the column,
   back across the row and along a diagonal, with a strict and then a looser
   ratio tolerance. Back across the row the total must be within 40% of the
   row's; down the column it may be up to twice or half the row's, since
   perspective stretches a finder more one way than the other. Centres
   within a module of each other merge.
4. Triples: three finders whose module sizes are within a factor of three.
   The top-left is the corner opposite the longest side. Each side from it
   is measured in modules: its length over the module size along it, from
   the dark-light-dark runs at both ends. The two sides must be at least 10
   modules, differ by at most 25% of the longer, and meet at an angle whose
   cosine is at most 0.5. Triples rank by that cosine plus that difference,
   less 0.01 for each sighting of the three finders (up to 15); the cross
   product puts the top-right finder on the right.
5. Size and alignment: size is the mean of the two sides in modules, plus
   7, rounded to `1 (mod 4)`. A projective map through the three centres
   weights each side by the square root of the ratio of its end module
   sizes (taken as 1 outside 0.5 to 2), so it follows perspective; equal
   sizes give the parallelogram. From version 2, alignment candidates are
   found near where that map, and the parallelogram, put the pattern, with
   runs sized from the map there; they are ranked by how well the 5x5
   pattern around each matches along the map's local axes or the
   parallelogram's, whichever matches better. The map's fourth corner, then
   the parallelogram's when they are more than a module apart, are the last
   resort. Sizes four and eight modules either side are retried.
6. Sampling: a perspective map from module centres to the picture, then
   format and version information, unmasking and Reed-Solomon correction
   (section 7.5 and annex B). A failed read is retried transposed, for
   mirrored codes, and the whole search is repeated on the inverted
   picture.
7. Segments: numeric, alphanumeric, byte, kanji (kept as Shift_JIS bytes),
   ECI, structured append and FNC1 (both reported; see below).
   Byte text is UTF-8 under ECI 26 or when it is valid UTF-8, and Latin-1
   otherwise or under ECI 1 or 3. Kanji and the other ECIs follow
   "Text for kanji and other ECIs" below. A byte run with no ECI in force
   that is not valid UTF-8 is Shift_JIS, not Latin-1, when it passes the
   test under "Shift_JIS without an ECI" below.

### Structured append and FNC1

A structured-append header (mode 0011: a 4-bit index counting from 0, a
4-bit total less one, an 8-bit parity) is reported as `structuredAppend`
with `index`, `total` (1 to 16) and `parity`. The decoder reads one symbol
alone: `text` and `bytes` hold that symbol's part only, and joining parts is
the caller's job. Only the first header in a symbol counts. Index and total
are reported as read, even when the index is not below the total.

FNC1 in first position (mode 0101, the GS1 format) is reported as `fnc1`
with `position` `first`. FNC1 in second position (mode 1001) is followed by
an 8-bit application indicator, reported as `applicationIndicator`, a
string: 0 to 99 are two digits (`05`, `37`), 165 to 190 and 197 to 222 are
the letter whose ASCII code is the value less 100. Any other value makes
the symbol unreadable. Only the first FNC1 indicator counts.

From the indicator onwards, an alphanumeric segment is rewritten before it
joins the payload: within the segment, `%%` becomes `%` and a lone `%`
becomes the group separator U+001D. The segment is rewritten alone, so a
`%` ending one segment and a `%` starting the next are two separators.
Numeric and byte segments are untouched, and so is everything before the
indicator. `bytes` holds the rewritten data, so it always equals `text`
encoded as UTF-8 for alphanumeric and numeric data. A reference decoder
does the same for first position; it does not read the second-position
application indicator at all, so there is none to compare against.

Both fields are absent, not null, for an ordinary symbol.

### Text for kanji and other ECIs

`bytes` never depends on a character set: it holds the symbol's data bytes
(kanji as Shift_JIS pairs, see step 7). Only `text` does, and `text` is
produced with the platform's own decoders (`TextDecoder` in JavaScript,
`java.nio.charset.Charset` on the JVM). No port bundles tables.

Every port must agree on these:

- ECI 26 is UTF-8, decoded by hand with each ill-formed byte as U+FFFD. ECI 1
  and 3 are Latin-1, byte for byte.
- ECI 27 and 170 are ASCII: a byte below 0x80 is that character, any other
  byte is U+FFFD.
- A kanji-mode character is its Shift_JIS pair decoded alone; if the platform
  returns U+FFFD for the pair, or has no Shift_JIS, the character is a single
  U+FFFD. The ECI in force before a kanji character stays in force after it.
- ECI 4 to 18 except 14 (ISO 8859-2 to -16 less -12, which does not exist;
  so ECI 13 is ISO 8859-11, 15 is -13, 16 is -14, 17 is -15, 18 is -16),
  with bytes 0x80 to 0x9F always the C1 control of the same value. ECI 21, 22
  and 23 (Windows 1250, 1251, 1252) with the bytes the code page leaves
  undefined (1250: 81 83 88 90 98; 1251: 98; 1252: 81 8D 8F 90 9D) as U+FFFD.
  ECI 20 is Shift_JIS, 24 Windows 1256, 25 UTF-16BE, 28 Big5, 29, 31 and 32
  GB 18030 (a superset of GB 2312 and GBK), 30 EUC-KR, 33 UTF-16LE. Ill-formed
  input becomes U+FFFD, and a leading byte order mark is kept.
- An ECI with no entry above, and any ECI whose character set the platform
  lacks, is read as if no ECI were present: valid UTF-8 is UTF-8, else
  Latin-1. This is the one thing left to the platform, with the exact
  mapping tables of the sets above; a platform's tables may differ from
  another's for rare code points (the JVM lacks ISO 8859-10 and -14 on a
  standard JDK, for instance, and so falls back for those two).

`test/charsets.json` records the JavaScript platform's text for every
13-bit kanji value, every byte of each single-byte set and a few multi-byte
and UTF-16 samples. The Kotlin tests read the same file; with
`windows-31j` for Shift_JIS, `x-windows-950`, `GB18030`, `x-windows-949` and
`x-iso-8859-11` they agree on all of it, apart from the two sets the JDK lacks.

### Shift_JIS without an ECI

Many codes carry Shift_JIS in byte mode with no ECI. For a byte run with no
ECI in force (each run between kanji characters or ECI designators is judged
alone) that is not valid UTF-8, a port decides between Shift_JIS and Latin-1
by this rule, which uses byte shapes only.

Scan left to right. A byte below 0x80 ends any run of katakana or of
double-byte characters. A byte from 0xA1 to 0xDF is a half-width katakana and
extends the katakana run. A byte from 0x81 to 0x9F or 0xE0 to 0xEF is a lead:
it must be followed by a trail from 0x40 to 0x7E or 0x80 to 0xFC, and the two
together are one double-byte character that extends the double-byte run (and
ends a katakana run). Any other byte of 0x80 or more (0x80, 0xA0, 0xF0 to
0xFF), a lead at the end of the run and a lead with any other trail rule
Shift_JIS out at once. If nothing rules it out, the run is Shift_JIS when it
has three katakana in a row, or three double-byte characters in a row, or any
double-byte character whose lead is 0x81 to 0x9F (those are control
characters in Latin-1, so they do not occur in Latin-1 text). Otherwise it is
Latin-1.

When the run passes, its text is the platform's Shift_JIS reading of the whole
run; if the platform lacks Shift_JIS, or the reading holds U+FFFD, the text is
Latin-1 as before. `bytes` is unchanged.

Judged ambiguous and read as Latin-1: one or two katakana-range bytes alone
(a lone `A5` is a yen sign, and `B1 B2` is two Latin-1 symbols), and a short
double-byte run led by 0xE0 to 0xEF. Judged ambiguous and read as Shift_JIS:
three high symbols or capitals in a row from 0xA1 to 0xDF, such as `C0 C9 C8`.

## Decode fixtures

`vectors/decode-frames/` holds 48 synthetic frames as 8-bit greyscale PNG,
and `vectors/decode-frames.json` gives each one's exact text, the drawing
parameters, and whether this decoder and an independent decoder read it
when the frames were made. The last 12 are at steep perspective, the far
edge 50 to 70% of the near one, with the narrowed edge on each side of the
symbol in turn (`turn`, quarter turns of the grid). A port must read every
frame marked `"typescript": true`. The frames are drawn by
`test/fixtures.test.ts` (`QR_WRITE_FIXTURES=1` regenerates them); every
payload in them is made up.

A second, separate set holds real photographs of QR codes with known contents,
taken from open-source test collections that were assembled for other
decoders; `vectors/photos.json` lists the sources, pinned commits and licences.
The images are not committed. `npm run fetch-photos` downloads them into
`vectors/photos-cache/`, checks each against its SHA-256, and converts them to
8-bit greyscale PNG so every port reads the same pixels; the tests skip when
that cache is absent. Expected text is compared exactly as stored, with no
trimming and no newline normalisation, and a photograph counts as read only
when the text is identical. Reading a photograph as the wrong text fails the
test; the number of photographs read may not fall below the recorded floor
(`ratchet.typescript`). Other decoders are tuned on these collections, so the
set supports no comparative claim. It is a regression bar and a first check
against real optics, nothing more.
