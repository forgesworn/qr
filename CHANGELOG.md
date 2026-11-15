# Changelog

## Unreleased

- Text without a `mode` is split into the numeric, alphanumeric and byte
  segments with the fewest bits, so payment URIs with an uppercase body fit
  smaller versions. `QrCode` gains `segments`. Symbols for text that one
  mode already covers are unchanged.
- The decoder reports `structuredAppend` and `fnc1`, reads kanji segments
  and the other ECI character sets as text, and reads Shift_JIS byte data
  that carries no ECI.
- A test set of 185 real photographs, fetched by hash at test time and not
  committed, with a floor on how many are read and a rule that none may
  decode to the wrong text.
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
