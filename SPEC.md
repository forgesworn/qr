# Specification

This is what every implementation of `@forgesworn/qr` (TypeScript now,
Kotlin and Rust later) must do, so that the same input gives the same
symbol byte for byte. `vectors/encode-vectors.json` is the test of it.
Section numbers refer to ISO/IEC 18004:2015.

## Input

- Text is encoded as UTF-8. Lone surrogates become U+FFFD.
- Bytes are encoded as given, always in byte mode.

## Mode

One segment per symbol. Unless the caller names a mode, text whose every
character is a digit is numeric; text whose every character is in
`0-9 A-Z space $ % * + - . / :` is alphanumeric; anything else, and the
empty string, is byte. Kanji mode and mixed segments are not produced.

With `eci: true`, a byte-mode symbol starts with the ECI designator
`0111` and assignment 26 (UTF-8) as 8 bits (section 7.4.2). Numeric and
alphanumeric symbols never carry one.

## Version and level

Level M unless the caller names one. The version is the smallest, from
`minVersion` (default 1), whose data capacity holds the header (ECI if any,
4-bit mode, character count in the width for that version band:
1-9, 10-26, 27-40) and the data, and whose count field can hold the
character count. A requested version that cannot hold the data is an
error, never a silent upgrade.

## Bit stream and error correction

Terminator of up to four zero bits, zero bits to a byte boundary, then
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

Renderers are not covered by the vectors and need not match byte for byte
across ports, but must keep these properties: the quiet zone is light;
a canvas or bitmap renderer puts module edges on whole pixels (edge of
module `i` at `round(i * width / side)`); a terminal renderer packs two
module rows per line with U+2580 (upper half), U+2584 (lower half), U+2588
(full) and space, inking light modules by default.

## Vectors

`vectors/encode-vectors.json` holds module matrices produced by ZXing core
3.5.3 (`scripts/generate-vectors.sh`). They cover every version at full
capacity, every mask, every level, all three modes, both count-length band
edges, the empty string and UTF-8 with ECI. ZXing is a development-time
oracle only and is not part of the package.

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
   ratio tolerance. Centres within a module of each other merge.
4. Triples: three finders of similar module size forming a near right
   isosceles triangle; the cross product puts the top-right finder on the
   right.
5. Size and alignment: size from finder distances over module size,
   rounded to `1 (mod 4)`. From version 2, alignment candidates are found
   near the corner the finders imply, and ranked by how well the 5x5 pattern
   around each matches along the code's axes; the parallelogram corner is
   the last resort. Sizes four and eight modules either side are retried.
6. Sampling: a perspective map from module centres to the picture, then
   format and version information, unmasking and Reed-Solomon correction
   (section 7.5 and annex B). A failed read is retried transposed, for
   mirrored codes, and the whole search is repeated on the inverted
   picture.
7. Segments: numeric, alphanumeric, byte, kanji (kept as Shift_JIS bytes),
   ECI, structured append (header skipped) and FNC1 (indicators skipped).
   Byte text is UTF-8 under ECI 26 or when it is valid UTF-8, and Latin-1
   otherwise or under ECI 1 or 3.
