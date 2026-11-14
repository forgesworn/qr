# Changelog

## 0.1.0

- First release: encoder (versions 1-40, levels L/M/Q/H, numeric,
  alphanumeric and byte modes, UTF-8 ECI) with SVG, canvas and terminal
  renderers.
- Decoder: RGBA or greyscale frames, local-threshold binarisation, finder
  and alignment search, perspective sampling, Reed-Solomon correction,
  inverted and mirrored codes, numeric, alphanumeric, byte, kanji (as
  bytes), ECI, structured append and FNC1 segments. `decodeModules` for a
  module grid.
- Encode vectors from ZXing core 3.5.3; jsQR round-trip tests; decoder
  tests on synthetic distorted frames with jsQR as the bar.
