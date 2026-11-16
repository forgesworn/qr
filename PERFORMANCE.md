# Performance work

Work started from `91dd037` on `perf/overnight-20261115`. The goal is a
measurably faster encoder and scanner without sacrificing correct reads,
port conformance, small downloads or the dependency-free core. No claim of
universal superiority is established by a desktop microbenchmark.

## Delivery and acceptance

- [ ] Reproducible before/after benchmarks: exact source identity, warm-up,
  interleaved timings, typical and slow cases, full decoded results.
- [x] Faster mask selection, with identical matrices and tie-breaking.
- [x] Cheaper failed decoder candidates, preserving recovered reads and work bounds.
- [x] Optional reusable camera decoder session, tested for changed frames,
  movement, polarity, independent sessions and stale-result rejection.
- [x] Usable optional browser WASM backend, full-result timing and memory
  lifecycle checks. SIMD evaluation recorded below when complete.
- [ ] Per-photograph accuracy regression gate and independent evaluation.
- [ ] TypeScript, Kotlin, Rust and WASM conformance; package/API documentation.
- [ ] Review final changes, commit, prepare a PR and run hosted checks.

Competitor evaluation must remain outside the package's dependencies. Compare
jsQR, ZXing-C++/WASM, browser-native scanning and relevant encoders with equal
inputs/options. Record unavailable browser/device evidence explicitly. Real
phone timings and a fresh camera corpus cannot be inferred from Node results.

## Execution constraints

Use the existing checkout and Rust target directory; at most two test workers.
No paid services, real payment payloads or maintainer messages. Bound individual
experiments and retain only measured improvements; investigate a failed approach
before repeating it. Keep API changes explicit in SPEC.md. Publication uses the
repository release workflow, never manual npm publishing.

## Current evidence and continuation

- Initial profiling: version-40 mask scoring took about 80% of sampled CPU;
  noisy decoding concentrated in symbol extraction and candidate sampling.
- Initial timing was on a heavily loaded Apple M1, Node 24.21.0. It is diagnostic,
  not release performance evidence.
- Baseline compiled modules are temporarily retained at
  `/tmp/qr-performance-Eoi9WV/baseline`; remove task scratch after recording results.
- Core checks: TypeScript typecheck and 412 tests passed, with the photograph
  cache required (no skipped suites). Native Rust: 24 tests passed. Kotlin:
  full suite passed including 179/184 photographs and no lost baseline reads.
- WASM: all 148 encoder vectors, 58 frames with 464 work counters, and 419
  option comparisons passed unchanged. Memory remained 1,376,256 bytes after
  warm-up through 5,000 rounds; the deliberately leaking control grew.
- Decoder block extraction: the new work regression failed on the baseline
  (29,714 module reads), then passed after incremental extraction. Implemented
  in TypeScript, Rust and Kotlin. No conformance vectors were changed.
- Full-result WASM timing now checks every returned field, including text.
  Character-set differences must be evaluated separately rather than silently
  accepted as equal results.
- Camera session implemented: `createDecoder()`, per-instance luminance
  storage, bounded cropped search, same-call full-frame fallback, reset.
  Tests cover changed payloads, blank replacements, movement, dimensions,
  current polarity options, padded grey/RGBA, independent sessions and invalid
  whole frames. Repeated reads of all 184 photographs preserve all first reads
  without wrong text. Typecheck and all 418 TypeScript tests passed.
- Core commits: `f47f80b` (scoring, block extraction and benchmark infrastructure),
  `621586b` (compare public points in full-result WASM timing; TypeScript's
  internal finder count/moduleSize properties are not public Point fields).
- Corrected full-result WASM timing passed on all three synthetic fixtures:
  blank TS/WASM 11.97/5.21 ms, clean 7.96/3.30 ms, noise 118.21/57.92 ms.
- Camera benchmark (`--suite session`), against the current stateless decoder:
  repeated clean grey 3.545/0.832 ms (4.26x), RGBA 7.284/1.316 ms (5.53x).
  Blank/noise medians stayed within 3%. These repeated-frame measurements
  describe tracking after warm-up, not initial acquisition or moving-camera
  performance. Host one-minute load was about 17.
- Current step: distributable browser WASM interface, independent comparative
  evaluation and final package/hosted checks. No physical device results or
  independent competitor ranking have been established.

### Optional WASM package

`@forgesworn/qr/wasm` exports `loadWasm(bytes)` and `wasmUrl`. Each instance
provides full encoder/decoder results, reusable input allocation, independent
copied outputs, reset, disposal and memory accounting. Shared validation and
capacity errors live in small modules so importing the WASM entry does not
import the TypeScript core. Rust's character-set limitations remain explicit.
The module performs no fetching, telemetry or access to cameras itself.

The 195,192-byte module is checked in with compiler/source/binary hashes.
`npm run build` verifies and copies it without needing Rust. `check:wasm`
rebuilds with Rust 1.94.1 and compares bytes; this also runs on Linux CI.
The anvil release workflow builds two independent npm tarballs, so both build
paths now include the same verified asset. Release publication remains through
the existing workflow, never manual npm publication.

Verified locally: real packed-package installation and exports, complete encoder
vectors and conformance frames, metadata, modes and error paths, independent
instances, output ownership after memory growth/disposal, and bounded memory
through 1,200 rounds. All 424 tests passed with required photos before one extra
mode/options test was added; that focused suite now passes all seven tests.
Chrome 157 successfully loaded the asset over localhost, read full frames on
the page and in a worker, and imported only image/error helpers with the WASM
entry. Browser-native QR detection is available on this Mac. This is desktop
browser evidence, not physical-phone acceptance.

Current comparative evaluation uses jsQR 1.4.0, zxing-wasm 3.1.7 (QR-only,
one symbol, tryHarder/rotate/invert/downscale, plain text) and qrcode 1.5.4.
Rivals are installed only in temporary external scratch. The new 96-frame
corpus uses qrcode-generated symbols with a fixed seed, rotation, shear,
contrast, noise, occasional blur and inversion; it was fixed before inspecting
results and has not been tuned against failures. It is synthetic, not fresh
camera evidence. Existing photographs are regression evidence, not held-out data.

Task-owned scratch: `/tmp/qr-performance-Eoi9WV`, photograph cache, and Rust
and Kotlin build output created by this task. Preserve pre-existing Gradle
caches and the neighbouring `qr-release` worktree. Browser profiles and
local servers are removed by their runners. Final report/CI/cleanup remain.

## Initial before/after measurements

`node scripts/performance.mjs --baseline /tmp/qr-performance-Eoi9WV/baseline`
compares full results before timing, then alternates implementations for 25
rounds after five warm-up rounds. Encoding rounds batch ten operations; decoder
rounds time one complete result. Timings below are medians in milliseconds on
Apple M1, Node 24.21.0. Host load was high (one-minute average 25–28); these are
preliminary paired measurements, not device acceptance or advertising claims.

| Workload | Baseline | Optimised | Speedup |
|---|---:|---:|---:|
| Encode URL | 0.211 | 0.163 | 1.29x |
| Encode mixed text | 0.957 | 0.714 | 1.34x |
| Encode 1,000 digits | 1.929 | 1.497 | 1.29x |
| Encode bytes, version 40 | 6.756 | 4.524 | 1.49x |
| Decode clean RGBA | 8.431 | 8.197 | 1.03x |
| Decode blank RGBA | 10.539 | 10.394 | 1.01x |
| Decode noise RGBA | 186.347 | 114.418 | 1.63x |

Baseline compiled-JavaScript SHA-256:
`03136b587f23b3a08301ea7d6715dca2f1246ec94617a08ca135c8440e677d48`.
Encoder-only optimised build SHA-256:
`db414e0f3735a3daa44c8feeeb07ba4ca42dad24cfdbfff8ffa24445938ba981`.
The benchmark prints build hashes, revision, dirty state, host load and p95
batch timings. Results are scoped to these fixtures; full conformance and
photograph preservation are separate gates.
