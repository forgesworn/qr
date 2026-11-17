# Changelog

## 0.3.13

- After the selected refined-grid header read fails, try its strict orientation
  and format hypothesis once on the direct mesh captured by the same refinement
  call. Preserve every earlier successful result, with no new image sampling,
  alignment search or secondary attempt.
- Recover five more codes across 1,120 evaluated curved images: 653 correct
  reads against 569 for ZXing-WASM 3.1.7. The separate 128-image set frozen
  before evaluation improves from 77 to 78 reads, against ZXing's 69. Earlier
  successful results, metadata and work counts remain identical in these
  checks; these are dataset results, not a universal accuracy claim.
- Mirror the recovery in TypeScript, Rust and Kotlin. Add two conformance
  frames while preserving all 82 previous entries. The 888-case regression
  suite, its 64 negative controls and all 2,944 photograph views retain their
  earlier outcomes, with no incorrect payloads observed.
- Keep the eight-second-look, 720-map and 11,500,000-alignment-probe limits.
  Retaining one more existing grid raises the conservative retained-grid bound
  to 281,961 module bytes, excluding active buffers and metadata. One additional
  strict symbol read is not counted by `Work`. The packaged WASM is 252,923
  bytes, 404 bytes larger than 0.3.12.
- Record the measured TypeScript trade-off: clean-frame medians rise
  3.77–6.15% and blank-frame medians 4.32–4.78% in two paired M4 runs.
  The five new WASM reads cost 0.19–0.89% more than their previous misses.

## 0.3.12

- After all earlier paths fail, read one different strict format hypothesis
  discovered on an existing refined grid. Preserve ordinary version,
  Reed–Solomon and segment checks and every earlier successful result.
- Recover eleven more codes across 992 evaluated curved images: 571 correct
  reads against 500 for ZXing-WASM 3.1.7. This includes one additional read in
  a separate 128-image set frozen before evaluation. These are dataset results,
  not a claim of universal accuracy.
- Apply the recovery to TypeScript, Rust and Kotlin. Add two conformance frames
  while preserving all 80 previous entries, results and work counts.
- Keep the eight-second-look, 720-map and 11,500,000-alignment-probe limits.
  Retain at most one additional existing grid and perform at most one extra
  strict symbol validation. Existing `Work` counters do not count that
  validation or the bounded format checks; unchanged counts do not imply
  unchanged CPU time.

## 0.3.11

- After all earlier paths fail, validate one retained orientation and format
  hypothesis against an already sampled refinement grid. Preserve strict
  validation and the priority of every earlier successful result.
- Recover two more codes across the previous 736 curved images, increasing
  correct reads from 438 to 440 against ZXing's 390. A separate 128-image set
  frozen before evaluation remains at 62 reads against ZXing's 57. These are
  measured datasets, not a claim of universal accuracy.
- Keep the limits at eight second looks, 720 maps and 11,500,000 alignment
  probes. The recovery adds no image sampling; it can retain one grid pair and
  perform up to two additional strict symbol validations. Existing `Work`
  counters do not measure those validations.

## 0.3.10

- After all earlier paths fail, refine one retained map with an exact version
  word, a weak contradictory peer and two agreeing format copies. Keep strict
  final validation and every earlier successful result and its metadata.
- Improve the earlier distortion set from 106 to 108/128 against ZXing’s
  106/128, and curved sheets from nine to ten reads out of 18. The separate
  newly frozen 128-case set remains at 67 reads against ZXing’s 53.
- Mirror the recovery across TypeScript, Rust and Kotlin. Bound work to eight
  second looks and 11,500,000 alignment probes, with the map cap still 720.
  This adds work to qualifying difficult failures in return for more correct reads.

## 0.3.9

- After every earlier decoder path fails, give one retained curved map that
  received only ordinary refinement the late alignment pass. Match its exact
  map, header hypothesis and luminance basis; retain strict final validation
  and the priority of all earlier successful results and metadata.
- Improve the earlier distortion set from 103 to 106/128, matching ZXing,
  and two evaluated holdouts from 62 to 63/128 and 71 to 72/128. A new set
  frozen before policy evaluation improves from 79 to 80/128, compared with
  ZXing's 70/128. Curved sheets improve from six to nine reads out of 18.
  No earlier successful result changes in these checks.
- Mirror the recovery across TypeScript, Rust and Kotlin with three new shared
  regression frames. Bound refinement to seven second looks and 10,062,500
  alignment probes; the 720-map limit and existing admission rules are unchanged.
  This trades additional work on some difficult failures for more correct reads.

## 0.3.8

- Retain one full-size curved map whose format copies disagree, with exact
  version evidence and a uniquely stronger format copy. Prefer the first
  zero/one-error copy over a two-error copy when the conflicting peer needs
  three corrections. Try it only after every earlier path fails; final
  two-copy format, version, Reed-Solomon and payload checks remain unchanged.
- Improve the evaluated distortion sets from 44 to 48/96, 89 to 103/128 and
  53 to 62/128. A separate set frozen before evaluation improves from 58 to
  71/128, compared with ZXing's 67/128. Earlier curved sheets improve from
  four to six reads out of 18. No earlier successful result changes in these
  checks; ZXing still leads on one evaluated distortion set.
- Bound the new recovery to one retained candidate and one terminal attempt,
  raising the maximum to six second looks and 8,625,000 alignment probes.
  Earlier attempts keep their order. This trades additional work on some
  difficult frames for more correct reads.

## 0.3.7

- After every earlier decoder path fails, allow one retained curved map that
  never received a full-size refinement attempt. It must already have an exact
  version anchor and non-conflicting readable headers. Strict final format,
  version and payload validation remain required; existing successful results
  and metadata retain priority.
- Improve the evaluated 96-case distortion set from 37 to 44 correct reads,
  the earlier 128-case set from 81 to 89, and a separately frozen 128-case set
  from 48 to 53. ZXing reads 42, 106 and 52 respectively. No earlier read is
  lost in these checks; significant curvature limitations remain.
- Keep TypeScript, Rust, Kotlin and packaged WASM aligned with three new shared
  fixtures covering normal, inverted and mirrored recovery. The terminal retry
  explicitly raises the maximum refinement attempts to five and the alignment
  probe bound to 7,187,500. The original four attempts and map budget remain
  unchanged; extra recovery work trades time for accuracy.

## 0.3.6

- Retain up to four failed alignment-mesh grids and read them only after all
  earlier decoder paths fail. Timing and edge corrections can displace an
  already readable mesh; deferred validation recovers it without changing
  existing successful results or their metadata. Strict header, version and
  payload checks remain in force.
- Improve the evaluated 96-case distortion set from 30 to 37 correct reads,
  a separately frozen 128-case set from 78 to 81, and the earlier curved-sheet
  set from two to three reads out of 18. No lost or incorrect
  reads occur in these sets. ZXing still leads overall on both distortion sets.
- Keep reduced-image coordinates and inverted polarity consistent across
  TypeScript, Rust, Kotlin and packaged WASM. Two shared conformance fixtures
  cover the recovered paths. Retained grids add bounded storage and sampling;
  map, alignment-search and second-look limits do not increase.

## 0.3.5

- Continue fully trusted alignment cells to the symbol boundary, fitting the
  three synthetic corners to the actual finder centres. Unmeasured outer
  cells retain the previous clamp; no search budgets or acceptance gates change.
- Recover both remaining views of the dense curved photograph: 16/16 target
  transformations and 2,872/2,944 across the photo set, with no lost reads.
  Recover two of the 18 evaluated curved sheets and one additional image in
  a separate 96-case distortion set. Significant curvature failures remain.
- Keep TypeScript, Rust, packaged WASM and Kotlin aligned through two new shared
  conformance sheets and stronger orientation tests. Previously readable
  payloads remain unchanged; correction counts and optional alignment locations
  can change because sampling or the successful placement changes.

## 0.3.4

- Preserve curved-map candidates from the existing inverse-luminance fallback
  and refine them with the same polarity-specific thresholds. Earlier reads
  retain priority; the 720-map and four-second-look limits remain unchanged.
- Recover seven inverted views of the dense curved photograph, raising its
  transformed-image result from 7/16 to 14/16. Across all 2,944 transformations
  of the 184-photo set, preserve earlier reads and add those seven successes.
- Keep TypeScript, Rust, packaged WASM and Kotlin aligned, with public photo
  regressions covering inversion options, orientation and input preservation.
  No public API changes.

## 0.3.3

- Recover a dense curved QR photograph with a deferred alignment retry. One
  exact version word anchors admission; final format, version, error-correction
  and segment checks remain required. Existing successful paths retain priority.
- Revisit missed alignment patterns once using frozen accepted neighbours,
  retaining the four-second-look and 720-map limits. The conservative maximum
  alignment-probe allowance doubles only for the deferred path.
- Apply the same behaviour to TypeScript, Rust, packaged WASM and Kotlin. Raise
  the photograph regression floor from 179/184 to 180/184; preserve all earlier
  outcomes across 888 checked cases, including 64 negative controls.
- Publish the limited curvature results and remaining failures alongside the
  comparison evidence. No public API changes.

## 0.3.2

- Recover additional difficult QR images when the correct finder triple ranks
  below the first six. The late fallback requires agreeing format and version
  information, shares the existing frame limits, and preserves earlier reads.
- Apply the same behaviour to TypeScript, Rust, packaged WASM and Kotlin, with
  a shared perspective regression and exact result/work conformance.
- Add four correct reads across the existing synthetic regression suites,
  with no lost success or wrong payload. The separate fresh qualification
  remains 69/128 for both old and new QR, versus 55/128 for ZXing-WASM 3.1.7.
- Align all registry versions on 0.3.2; JSR 0.3.1 was the packaging fix for
  library 0.3.0. No public API changes.

## 0.3.0

- Optional `@forgesworn/qr/wasm` backend with a bundled module, complete
  decoded results and platform character-set support. Load it explicitly;
  ordinary TypeScript imports require no WebAssembly setup.
- `createDecoder()` sessions for repeated camera frames in TypeScript and WASM.
  Sessions read fresh pixels, search the previous region first, and fall back
  to the full frame in the same call. Reset and disposal are explicit.
- Improved inverted-image recovery and faster encoding and decoding across
  TypeScript, Kotlin and Rust. Lazy sampling, earlier format/error-correction
  rejection, reusable storage and exhausted-search guards reduce avoidable work.
- Version-directed recovery for misestimated large symbols: agreeing format
  and version copies can trigger a final bounded retry. This recovers the
  previously missed blurred version-40 regression image in all three ports
  without increasing map or second-look budgets.
- Reproducible WASM builds with pinned Rust 1.96.0 and an independent Linux
  byte comparison. Published npm tarballs must match across two independent
  release builds, with trusted publishing and provenance.
- Published accuracy and performance evidence against pinned independent
  readers, including per-photograph regression checks and a frozen stress set.
  Accuracy preservation takes priority over faster rejection; unsuccessful
  strict-finder experiments are documented and excluded from the decoder.
- Fixed a native Rust invalid-size overflow in `decode_modules`; invalid QR
  dimensions now return `None` before multiplying the supplied size.
- Native `forgesworn-qr` crate with registry metadata, standalone package tests,
  Rust API documentation and checked renderer dimensions.
- Public static documentation, a library-selection guide, updated integration
  examples, security reporting, and generated full plain-text documentation.
  CI checks documentation links and generated text for drift.

## 0.2.0

- CI downloads and verifies the real-photograph set for both TypeScript
  and Kotlin, and runs the WebAssembly result, option, encoder, module-grid
  and memory checks, plus native renderer comparisons. Local tests use at
  most two workers, and the damage suites inherit the shared timeout.

- Text without a `mode` is split into the numeric, alphanumeric and byte
  segments with the fewest bits, so payment URIs with an uppercase body fit
  smaller versions. `QrCode` gains `segments`. Symbols for text that one
  mode already covers are unchanged.
- The decoder reports `structuredAppend` and `fnc1`, reads kanji segments
  and the other ECI character sets as text, and reads Shift_JIS byte data
  that carries no ECI. Windows 1252 (ECI 23) is read by hand, because one
  supported Node release reads that set as Latin-1.
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
  with no code in it now costs more on average. Two more photographs of the
  test set read, so the floor is 179.
- A conformance pack for ports in other languages, `vectors/conformance.json`
  with `vectors/README.md`: greyscale conversion, module grids, and for 58
  pictures the binarised image, the reduced sizes, the finder candidates,
  the triples, sizes and sampling maps, the result and the work counted.
  Both ports are held to it.
- A Rust port in `rust/`, with no dependencies: the encoder, SVG and
  terminal renderers and the whole decoder, held to the same vectors and
  giving the same reads, locations and counted work as the TypeScript on
  603 pictures at four turns each, from sets kept outside the repository.
  It builds to WebAssembly and decodes in about half the TypeScript's time
  there. It bundles no character tables, so its text can differ from the
  other ports', and it refuses hanzi symbols. Not published as a package
  yet.
- SPEC.md states every stage of the decoder exactly, and the details of
  the encoder that were left to the code; lengths are a square root of
  squares so that ports agree to the last place.
- Text under an ECI the platform cannot read, or one that names no set the
  decoder knows, is no longer guessed as UTF-8 or Latin-1: what cannot be
  read is U+FFFD, with ASCII kept under the single-byte sets. `bytes` and
  `eci` are unchanged. Greek under ECI 9, read where there is no decoder
  for it, used to come back as accented Latin letters.
- The decoder reads hanzi segments (GB2312).
- Decoding is faster with no change to what is read or to the work counted.
  The row scans for finder and alignment patterns walk each row's changes
  of colour, found once and shared by both polarities, and the three
  reduced sizes come from one pass over the picture. Measured in Node on
  one arm64 machine, on the photographs used in development (about 4
  megapixels on average): the median frame that read took 6.7 ms against
  10.6, the median frame that did not 11.3 ms against 28.2, and the totals
  over the set, which the slowest frames dominate, fell to about 40% and
  30%. A clean code that reads at the first try gains little, and a frame
  of pure noise about a fifth. The Kotlin port's total was roughly half on
  a desktop JVM. The rows' changes of colour are kept while a frame is
  searched: up to 4 bytes a pixel more on a picture that is all fine
  texture, and 6 to 10 MB more at the peak on 12-megapixel photographs.
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
