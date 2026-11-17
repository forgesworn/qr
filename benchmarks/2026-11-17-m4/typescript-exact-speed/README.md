# Exact TypeScript decoder speed-ups

Baseline: commit `e1e860b`, the low-resolution candidate, whose compiled
JavaScript hashes to `a7bd9146722e65c939cec27f92cea5ca6a4d42441e04b46c68aac94820891183`.
Candidate: the same sources with four TypeScript changes, compiled JavaScript
`f019b9a76c7a91924b1869d33ed186a1e5ccc611f61fc70d1515b57f4d1f095b`.
The release comparison uses v0.3.14's compiled JavaScript,
`e3bcc959b0ec06d26142a75918820c3889f920aaf00e9e3561ac1ead72807746`, whose 19
generated files match the 0.3.14 qualification identity.
Rust, Kotlin, SPEC, vectors and the packaged WASM are unchanged; the WASM
rebuilds to the baseline's SHA-256 `1f581db1…40bc45`.

## Changes

Each change keeps every result and Work counter, by construction and by test.

1. RGBA luminance reads each pixel as one 32-bit word on little-endian hosts
   when the data is 4-byte aligned. The channels and arithmetic are the same
   bytes and expressions as the byte loop, which remains for unaligned data
   and big-endian hosts. Input validation already guarantees every pixel the
   loop reads exists.
2. The alignment search keeps the merge frontier that the Rust and Kotlin
   ports already use: a candidate more than a module above every later
   centre cannot match again, so it leaves the merge search while staying in
   the full history, whose order and final sort are unchanged.
   Its run-length tests use tables built by applying the original tolerance
   test to each integer, and a vertical walk stops once its run is longer than
   any accepted run. The tables live in reused module buffers, read only at or
   below the current call's longest accepted run.
3. Alignment scoring precomputes the 75 offsets `(i * u + j * v) * scale` per
   basis with the original expression, so each sample point is the same
   double, and stops a scale once even perfect remaining modules cannot beat
   the best score.
4. Finder cross-checks step through pixel indices with the in-picture count
   worked out in advance, without try/finally; the row scan passes runs as
   numbers. Reed–Solomon syndromes use a 30-row lookup table, the same
   arithmetic Rust already uses.

`test/luminance.test.ts` compares the word path and the byte path with the
specified conversion across alignments, strides, alpha values and both
array types.

The same alignment changes were ported to Rust and rejected. In two paired
WASM processes the combination was 5–18% slower on noise frames. Alone, the
precomputed offsets changed noise by −0.6% to −1.8%, and the vertical cut-offs
by −0.1% to +1.1%, so Rust keeps its original code.

## Verification

- `../noise-policy-screen/harness/driver.mjs` decoded 5,778 images with the
  baseline and candidate builds on the M4: the 5,538 regression images and the
  two 120-frame development sets of the noise-policy screen.
  `exactness.json` records both build hashes and, per suite, the images,
  complete-result differences (every field, finder bookkeeping included) and
  Work differences: none in all 5,778. The regression images are not
  independent of earlier development.
- With photographs required, all 525 TypeScript tests pass, including the
  conformance pack's recorded results and Work counts.
- With the Rust sources unchanged, all 50 Rust tests and the doctest pass in
  the all-feature configuration.

## Timings

All runs are sequential processes on the M4 Max with native Node 24.21.0,
using RGBA frames. Complete results and unchanged pixels are checked outside
the timed calls. The desktop was in use by other applications, with load
averages of about 4 to 6; pairing keeps the comparison fair, but absolute
times are not quiet-machine figures.

`scripts/compare-typescript.mjs --negative`, at least 20 warm-up pairs and one
second, then 60 alternating pairs per case, against v0.3.14
(`release-ts-1.json`, `release-ts-2.json`):

| RGBA frame | v0.3.14 median, ms | Candidate median, ms | Change, run 1 / 2 |
| --- | ---: | ---: | ---: |
| Clean 1280 x 720 | 3.761–3.883 | 3.014–3.130 | −19.4% / −19.9% |
| Blank 1280 x 720 | 3.006–3.074 | 2.225–2.288 | −25.6% / −26.0% |
| Main noise 1280 x 720 | 48.933–50.387 | 43.130–44.329 | −12.0% / −11.9% |
| Other noise, six cases | | | −4.1% to −11.9% |
| Stripes | 17.113–17.307 | 13.444–13.557 | −22.3% / −20.8% |
| Checkerboard | 13.494–13.569 | 10.873–11.024 | −19.9% / −18.3% |
| Gradient | 9.196–9.455 | 8.317–8.472 | −10.4% / −9.6% |

Against `e1e860b` (`ts-1.json`, `ts-2.json`) the same cases change by −20.2% /
−21.5% clean, −27.9% / −27.8% blank, −12.3% / −11.7% main noise, −4.9% to
−12.3% on the other noise cases, −21.2% / −22.0% stripes, −18.7% / −19.8%
checkerboard and −10.2% / −9.8% gradient. Every case's p95 falls in all four
runs.

The low-resolution candidate's 16-case workload (`paired.mjs` in TypeScript
mode, at least ten warm-up pairs and 500 ms, then 60 pairs) also ran against
v0.3.14 (`release-paired-ts-1.json`, `release-paired-ts-2.json`). Its fixed
frames change by −21.4% / −20.2% clean, −27.5% / −27.7% blank and −12.3% /
−11.8% noise. The two earlier successes change by −0.8% / −1.2% and −3.8% /
−2.7%. The two persistent misses that qualify for the enlarged search take
388.7% / 387.1% and 598.1% / 581.7% longer than in v0.3.14, and the nine new
reads 65.5–588.4% longer than v0.3.14's misses. Those costs belong to the
low-resolution step and are as its own receipts describe; this change does
not remove them.

These are desktop measurements, not phone or worst-case latency. The WASM
backend is unchanged and remains the faster one, and random-noise rejection
stays slower than ZXing-WASM's.

## Reproduction

Build the baseline and candidate `dist` directories, then on the M4:

```sh
node scripts/compare-typescript.mjs BASELINE_DIST CANDIDATE_DIST --negative
node benchmarks/2026-11-17-m4/low-resolution-recovery/paired.mjs ROOT RELEASE_DIST RIVALS ts RELEASE_DIST/qr.wasm OUTPUT
node benchmarks/2026-11-17-m4/noise-policy-screen/harness/driver.mjs ROOT RIVALS 6 OUT base=BASELINE_DIST exact=CANDIDATE_DIST --only photos184,photoTransforms2944,stress256,qualified160,validation192,synthetic96,lowres224,curved1120,curvedNew256,conformance94,negatives12,spreadDev120,step9Dev120
```

`ROOT` is a built checkout of the candidate with the photograph cache,
`RELEASE_DIST` the built v0.3.14 and `RIVALS` the pinned installation holding
the independent encoder used to render the synthetic sets, given as absolute
paths. The driver writes one row per image; equal result hashes and equal
Work objects across the two builds are the acceptance test.
