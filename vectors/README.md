# Vectors

Everything a port of this library in another language needs to check itself
against, without reading the TypeScript. SPEC.md says what to build; these
files say whether it was built right. The TypeScript library generates them
and the Kotlin port in `kotlin/` passes them unchanged, which is the proof
that a second implementation can.

All payloads are made up. JSON numbers are the shortest decimal that reads
back as the same IEEE 754 double, so a port compares them exactly, not
within a tolerance.

## The order to work through

1. `encode-vectors.json`: the encoder.
2. `conformance.json`, `tables` and `luminance`: the standard's tables, and
   greyscale from RGBA.
3. `conformance.json`, `symbols`: reading a module grid.
4. `conformance.json`, `frames`: reading a picture, a stage at a time.
5. `decode-frames.json` and `photos.json`: reading rates, once the rest holds.

## `encode-vectors.json`

148 cases. Each gives `text`, `ecc`, whether a UTF-8 ECI is asked for, and
any fixed `requestedVersion` and `requestedMask`; then what the encoder must
produce: `version`, `mask`, `mode`, `segments`, the bit count `bits`, and the
symbol as `rows`. A row is the modules of one line, left to right, most
significant bit first, padded with zeros to whole bytes, in hex. The symbols
were built by an independent open-source encoder used as an oracle; the
choice of segments is this library's own and SPEC.md defines it.

## `conformance.json`

### `tables`

The two tables of the standard a port would otherwise need a copy of it
for. `blocks[version - 1][level]`, with levels in the order L, M, Q, H, is
Table 9's row: the check codewords in a block, the number of blocks in the
first group, the data codewords in each of those, and the number of blocks
in the second group, whose blocks hold one more data codeword.
`alignment[version - 1]` is Annex E's list of alignment pattern centre
coordinates, empty for version 1; a pattern sits at every pair of them
except the three that fall on finder patterns.

### `luminance`

`rgba` is `width` by `height` pixels, four bytes each, in hex; `grey` is the
greyscale the decoder must make of it, one byte a pixel: `(77 R + 150 G +
29 B) >> 8`, blended onto white by alpha and truncated.

### `symbols`

Module grids for `decodeModules`: `size` and `rows` as above, a `name` that
says what the case is for, and `result`, which is `null` when the grid must
not read. Otherwise it holds `bytes` (hex), `text`, `version`, `ecc`, `mask`,
the `eci` assignments in the order met, `corrected` (errors put right, summed
over the blocks) and `mirrored`. The cases cover a block corrected at and
past its capacity, a mirrored grid, a symbol of nothing but zero codewords,
blank version blocks, a damaged format copy, ECI 23 and 26, kanji, hanzi and
mixed segments.

`bytes` never depends on the platform. `text` does for kanji, hanzi and the
ECIs SPEC.md leaves to the platform's character sets: a port on a platform
without Shift_JIS or GB 18030 gives U+FFFD there, as SPEC.md says, and must
say so in its own notes. ECI 1, 3, 23, 26, 27 and 170 are read by hand and
must match everywhere.

### `frames`

Pictures, 8-bit greyscale PNG, named by `file` relative to this directory:
the 48 synthetic photographs of `decode-frames/`, then thirteen in `conformance/`
made for the paths those do not reach (blank, a gradient, noise, finder
patterns with no code, a picture under 40 pixels a side, a close-up read
only at reduced size, the same refused there by the format gate, a bent
symbol read by the second look, a larger one read through the mesh, a
symbol of zero codewords, and three shaded light-on-dark symbols requiring
inverted-luminance thresholds, including mirrored and reduced-size reads).

The inverted-luminance fallback regeneration adds those three frames and
increases the cross-check work for the existing refused close-up format and
zero-codeword frames. Every earlier frame keeps its result and all stage
bytes. The extra work is intentional: those failed frames now qualify for
the bounded final pass in SPEC.md step 10.

For each, in the order a port can build the decoder:

- `luminance`: SHA-256 of the greyscale bytes, row by row (step 1). If this
  differs the picture was not loaded as 8-bit grey.
- `bits`: SHA-256 of the binarised picture, one byte a pixel, 1 for dark
  (SPEC.md, decoder step 2).
- `reduced`: SHA-256 of the greyscale picture shrunk by 2, 4 and 8 (step 9),
  or `null` where a side would shrink to nothing.
- `finders`: the finder candidates in the binarised picture at tolerance 0.5
  and at 0.8, in the order the scan returns them, each as `[x, y,
  moduleSize, count]` (step 3).
- `triples`: for each tolerance, the finder triples in the order the search
  takes them (step 4), each as the three finders' places in the `finders`
  list above, top-left, top-right, bottom-left, with the `size` estimated
  for it in modules, or `null` when it has none (step 5).
- `placements`: the sampling maps of the first triple at tolerance 0.5, at
  its own size, in the order they are tried (step 5): the `size`, the
  `alignment` pattern's centre or `null`, and the nine numbers of the
  projective `matrix`, row by row, that takes module (x + 0.5, y + 0.5) to
  the picture. Empty when the scan gives no triple.
- `result`: `null`, or the fields of `symbols` with `inverted` and
  `location`: `topLeft`, `topRight`, `bottomLeft` and `alignment` (or
  `null`) as `[x, y]` in picture coordinates.
- `work`: what the decoder counted on the way (SPEC.md, Bounded work):
  `steps`, `compared`, `scanned`, `maps`, `second`, `meshes`, `probed` and
  `reduced`. SPEC.md lets a port find codes another way; one that does can
  use only `result` here. A port that follows the reference pipeline must
  match every stage and count, and then the bounds on its work and the
  evidence that it reads no wrong text carry over from the reference.

Regenerate with `QR_WRITE_CONFORMANCE=1 npx vitest run
test/conformance.test.ts`. A change to this file is a behaviour change: it
needs a reason, and SPEC.md in the same commit.

## `decode-frames.json` and `decode-frames/`

The 48 synthetic photographs and the `text` each holds, with how it was
drawn (`shot`) and whether this decoder (`typescript`) and an independent
one read it when the frames were made. A port must read every frame marked
`typescript`.

## `photos.json`

A manifest of 184 real photographs from open-source test collections: paths
and SHA-256 hashes only. `npm run fetch-photos` downloads them, with their
expected texts, into `photos-cache/`, which is not committed. A port must
never read one as the wrong text, and should read the ones marked as read.
The sources and their licences are named in the manifest.

## `own-photos.json`: the project's own photographs (being gathered)

The photograph set above is other projects' work, used under their licence.
This is the start of one that is wholly ours. `npm run photo-sheet` writes
`own-photos.json`, 24 codes from version 1 to the mid twenties with
made-up payloads, and a printable `own-photos-sheet.html` (not committed)
with each code at 55 mm and its id beneath it.

To add pictures: print the sheet at full size, or show it on a screen, and
photograph one code at a time. Name each file `<id>__<what>.jpg`, for
example `own-07__tilted.jpg`, and put it in `vectors/own-photos/`, which is
not committed until the set's size and format are settled. Worth a picture
each, with any phone:

- straight on, filling about half the frame; then small, a tenth of it;
- tilted about 30 and about 60 degrees, from the side and from below;
- turned a quarter and a half turn, and upside down;
- wrapped round a bottle or a mug; on a crumpled and a folded sheet;
- in shade with a hard edge across it; under a lamp's glare; in dim light;
- out of focus; with the phone moving;
- with a finger over one corner; with a tear or a stain across it;
- on a phone screen and on a monitor, close enough to show the pixels;
- through a window or a plastic sleeve;
- two codes in one frame.

A picture's file name gives its code, the manifest gives the text, and a
test will then hold the decoder to a floor on how many read and to the
rule that none reads as anything else.

## Tests that are not files

The suites that draw damaged, bent, close-up and empty frames from a seeded
generator are not in these files; each port writes the generator again
(`(s * 1664525 + 1013904223) mod 2^32`, divided by 2^32). They guard
against wrong text across hundreds of random cases. A port should have them,
but the files above are enough to know it implements the same decoder.
