# Encoder specification

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

## Vectors

`vectors/encode-vectors.json` holds module matrices produced by ZXing core
3.5.3 (`scripts/generate-vectors.sh`). They cover every version at full
capacity, every mask, every level, all three modes, both count-length band
edges, the empty string and UTF-8 with ECI. ZXing is a development-time
oracle only and is not part of the package.
