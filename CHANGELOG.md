# Changelog

## Unreleased

- Text without a `mode` is split into the numeric, alphanumeric and byte
  segments with the fewest bits, so payment URIs with an uppercase body fit
  smaller versions. `QrCode` gains `segments`. Symbols for text that one
  mode already covers are unchanged.
- The decoder reports `structuredAppend` and `fnc1`, reads kanji segments
  and the other ECI character sets as text, and reads Shift_JIS byte data
  that carries no ECI.
- A test set of 184 real photographs, fetched by hash at test time and not
  committed, with a floor on how many are read and a rule that none may
  decode to the wrong text.
- The decoder reads steeply tilted codes: finders stretched by perspective,
  triples whose far side is much narrower, and an alignment search placed
  by a projective map. A symbol of version 7 or above whose two version
  blocks are both unreadable is read from its size.
- When the ordinary search reads nothing, the decoder looks once more at
  up to four placements whose two format copies agree, moving module
  centres onto the timing patterns and edges the picture shows and sampling
  grey. It reads codes on curved or warped surfaces that were missed
  before; tests of damaged symbols require nothing or the original text.
- From version 7 that second look first bends the placement onto the
  alignment patterns it can find, so large symbols photographed through a
  lens or on paper that is not flat read. It makes no more reads than
  before, and a placement whose version information names another size no
  longer takes one of the four places.
- Fixed: a version 40 symbol whose size estimate came out just past 177
  modules was given up on without trying 177.
- Fixed: a texture matching a mask pattern beside finder patterns (a
  checkerboard, stripes, a screen's moire) could be returned as a read with
  empty text. A symbol whose data codewords are all zero now reads as
  nothing; an empty payload as `encode('')` writes it still reads.
- The decoder refuses a block that needed more corrections than Table 9
  allows it. That changes versions 1-L, 1-M and 2-L only, where the standard
  holds back check codewords to catch a misdecode and Reed-Solomon alone
  would correct one error more (3, 5 and 5 against 2, 4 and 4). A damaged
  symbol at those three sizes that was read on its last correctable error
  now reads as nothing; one photograph of the test set is lost to it, so
  the floor is 177.
- When nothing reads at full size, the decoder searches the picture again
  shrunk by 8, 4 and 2, so close-ups whose large modules carry scan lines,
  a screen's moire or grain read. The reduced sizes share the frame's caps
  on maps and second looks, and a read there counts only if both format
  copies agree with its level and mask. The caps are unchanged, but a frame
  with no code in it now costs more on average.
- The decoder reads hanzi segments (GB2312).
- The locator's work on a frame full of finder-like patterns is bounded.
- `encode` takes only a string or a `Uint8Array` and says what it was given
  otherwise; input no version can hold is refused before anything is built
  from it, so a named mode with over-long text now throws `QrCapacityError`
  first. `decode` takes only `Uint8Array` or `Uint8ClampedArray` data,
  refuses a buffer of three bytes a pixel unless `channels` is named, and
  checks `inversion`. `null` options mean none in both.
- The tests read every version at every level, filled to the last byte,
  back with an independent decoder; one vector added, version 23 at
  level L.
- Fixed: `decode` checks the data length when `channels` is given; `isDark`
  is false outside the symbol; a fixed `version` below `minVersion` throws;
  `toSvg` output always parses as XML, and an empty `title` adds no image
  role.
- Kotlin port of the encoder and decoder in `kotlin/`, pure JVM 17, checked
  against the shared encode vectors and decode frames, with an independent
  library as a test-only oracle; a `kotlin` job in CI.

## 0.1.0

- First release: encoder (versions 1-40, levels L/M/Q/H, numeric,
  alphanumeric and byte modes, UTF-8 ECI) with SVG, canvas and terminal
  renderers.
- Decoder: RGBA or greyscale frames, local-threshold binarisation, finder
  and alignment search, perspective sampling, Reed-Solomon correction,
  inverted and mirrored codes, numeric, alphanumeric, byte, kanji (as
  bytes), ECI, structured append and FNC1 segments. `decodeModules` for a
  module grid.
- Encode vectors from an independent encoder; round-trip tests through an
  independent decoder; decoder tests on synthetic distorted frames with that
  decoder as the bar.
