# Performance and verification

## M4 improvement programme — active

This phase starts from `a4f78ff`, with Astra coordinating technical decisions
and review, Terra workers handling bounded decoder experiments, and the primary
agent integrating and running M4 measurements. The goal remains better QR
scanning than ZXing; a universal superiority claim is not established.

Measurements now use an Apple M4 Max, native arm64 Node 24.21.0 and Chrome 157.
Task-owned checkouts preserve the existing M4 checkout and running applications.
ZXing-WASM 3.1.7 was still the registry's current version at baseline setup.
The same pinned external rival packages and complete-result comparisons are
used. Source/binary identities, workload hashes and load are retained in
[the M4 receipts](benchmarks/2026-11-16-m4/). Candidate numbers name successive
experimental snapshots. The current implementation is `d21f0c2`, following
`dc62837` for direct run enumeration and Rust word comparisons. The sixth
candidate adds TypeScript word comparisons; the fifth and sixth use the same
WASM bytes. Merge, publication and physical camera acceptance remain pending.

The sixth candidate measured (median latency, lower is better):

| Measurement | Our packaged WASM | ZXing-WASM |
|---|---:|---:|
| Clean 1280×720 RGBA, median ms | 1.815 | 2.230 |
| Blank 1280×720 RGBA, median ms | 1.362 | 2.225 |
| Random noise, median ms | 23.253 | 8.120 |
| Existing photographs, exact text | 179/184 | 171/184 |
| Existing synthetic development set, exact text | 91/96 | 89/96 |
| Synthetic validation regression set, exact text and bytes | 172/192 | 169/192 |
| Ten-frame moving/changing-payload sequence, median total ms | 8.208 | 20.823 |

The current receipts are [`candidate6-libraries.json`](benchmarks/2026-11-16-m4/candidate6-libraries.json),
[`candidate6-sessions.json`](benchmarks/2026-11-16-m4/candidate6-sessions.json)
and [`candidate6-validation.json`](benchmarks/2026-11-16-m4/candidate6-validation.json).
The complete negative-frame matrix and Chrome page/worker measurements are
retained alongside them. Their hashes identify the exact build and workloads.

The sequence uses our new tracked WASM session and independently encoded
synthetic frames. It includes initial acquisition, small movements, a changed
payload, a jump, a blank and reacquisition; it is not physical camera evidence.
The old 96-frame set is now development data. A separate 192-frame synthetic
validation seed and payload prefix were fixed before evaluating the candidate;
it returned 172 correct reads against the baseline's 157 and ZXing's 169, with
zero wrong results from any of those implementations and no lost baseline
successes. TypeScript and packaged WASM agree on every outcome. It uses fresh
pixels and payloads from the same transformation family, so it is not a new
independent photographic corpus. The receipt is
[`candidate3-validation.json`](benchmarks/2026-11-16-m4/candidate3-validation.json).
The fourth candidate retained every outcome in
[`candidate4-validation.json`](benchmarks/2026-11-16-m4/candidate4-validation.json).
Single-pass accuracy-loop timings are diagnostic, not latency comparisons.

The third candidate's paired negative-frame run shows the exact uniform-image
shortcut taking 1.26–1.29 ms across three blank levels, against ZXing's
1.99–2.06 ms. Noise is 13–34% faster than the baseline across two fixed seeds
and three resolutions. Those cases still favour ZXing, as do
stripes and checkerboards. A smooth gradient is slower than the baseline
because the new inverse-threshold recovery does more work; that regression
remains visible in the receipts: 2.62 ms baseline, 4.76 ms candidate, 2.18 ms
ZXing for the gradient. The bounding-box guard has no established overall
WASM noise improvement beyond candidate 2; its benefit is workload dependent.

Implemented work in this phase includes lazy module sampling, bounded alignment
scoring, exact binarisation optimisations, an inverse-luminance recovery pass,
tracked WASM sessions and host character-set support during segment parsing.
The latter closes the packaged backend's text gap: all 179 previously readable
photographs now have the expected text, with raw bytes matching TypeScript. The standalone Rust/default
WASM contract remains separate from the packaged host-text ABI 2 module.

Geometry-based early rejection was investigated and rejected: deterministic
finder/timing damage cases prove it can discard correct reads. These cases are
now public-contract regression tests. They are adversarial engineering evidence,
not an independent accuracy ranking.

The frozen candidate passed all 452 TypeScript tests with photographs required
on M4 and the byte-for-byte packaged WASM rebuild. Earlier integration checks
passed 25 native Rust tests with all features, the full Kotlin suite,
packed-package verification, and standalone WASM parity
(61 frames/488 counters, 572 option comparisons, 148 encoder vectors). The
5,000-round memory check stayed flat after warm-up, with a leaking control that
grew. Chrome page and worker checks cover host character sets and session use.
The final M4 Rust (25 tests), Kotlin and packed-package reruns passed, as did
standalone WASM frame, option, encoder, module-grid and rendering parity, and
the repeated-read memory check. Chrome page/worker checks passed on the frozen
candidate. The local M1 rerun was stopped while unrelated work overloaded it;
verification moved to the M4 after its benchmarks. The required local pre-push
check also passed after the load subsided. Further source changes require fresh
verification before delivery.

A diagnostic build retaining WASM function names attributes about 39% of the
noise-frame profile to finder discovery (including cross-checks and row edges),
34% to location/alignment search and 13% to Reed–Solomon correction. This is
sampled profiling with instrumentation overhead, not a latency result.
[The profile summary](benchmarks/2026-11-16-m4/candidate3-wasm-profile.json)
records its distinct binary hash; the distributed asset remains stripped.

An exact alignment-offset cache was measured and rejected: 60 paired rounds
gave essentially unchanged noise time (26.440 vs 26.435 ms), with clean frames
1.846 vs 1.856 ms. Across six other noise cases its improvement was only
0–1.5%, insufficient to justify the additional setup/storage. Finder-ratio
lookup and integer-arithmetic prototypes were also rejected after equivalence
checks because whole-frame timings did not improve.

A compact Reed–Solomon syndrome table did improve the paired prototype: the
original noise frame fell from 26.473 to 25.086 ms (5.2% less), with six other
noise cases improving by 2–8% and clean-frame time unchanged. The integrated
version uses a production helper tested against the original field operations
at all 512 exponent indices. All 7,680 table entries match field multiplication;
a temporary differential harness also checked correction outcomes and mutated
bytes against the original full algorithm. The packaged binary grows from
202,895 to 211,081 bytes (8,186 bytes, 4.0%, including code). Its final timing
and validation receipts follow the rebuilt helper rather than assuming that
the scratch prototype represents the shipped code. The final paired run
measured 27.109 to 25.609 ms for noise (5.5% less), with clean and blank frames
slightly faster in the same run. These paired results, not timings subtracted
across separate runs with differing host load, establish the improvement.
See [`candidate4-paired.json`](benchmarks/2026-11-16-m4/candidate4-paired.json).
The final module passed all 452 JavaScript tests with photographs, 27 native
Rust tests with all features, packed-package checks and Chrome page/worker
checks. The earlier Kotlin results remain applicable: this refinement changes
only the Rust arithmetic implementation and its WASM asset.

The fifth candidate (`dc62837`) reads complete finder and alignment run windows
from cached row boundaries in all three ports. It preserves candidate order,
successful-finder resets, clipped window ends, results and work counts. Rust
also finds row boundaries using eight adjacent byte comparisons at a time,
without SIMD, unsafe code or additional runtime features. The module is
210,658 bytes, 423 bytes smaller than the fourth candidate.

The paired M4 comparison against `44813f9` measured:

| Workload | Before, median ms | Fifth candidate, median ms | Change |
|---|---:|---:|---:|
| Clean 720p | 1.875 | 1.730 | 7.7% less time |
| Blank 720p | 1.278 | 1.288 | 0.8% more time |
| Noise 720p | 25.057 | 22.203 | 11.4% less time |

The binary hashes in [`candidate5-paired.json`](benchmarks/2026-11-16-m4/candidate5-paired.json)
identify both builds; its runner revision is the fourth candidate. The separate
incremental comparison isolates the word-comparison change on top of direct
run enumeration. Across six other noise cases, the fifth candidate takes
9–12% less time. All 192 synthetic outcomes remain identical to the fourth
candidate: 172 correct reads, no wrong results and no lost successes.
See [`candidate5-negative.json`](benchmarks/2026-11-16-m4/candidate5-negative.json)
and [`candidate5-validation.json`](benchmarks/2026-11-16-m4/candidate5-validation.json).
This previously unseen set is now regression data, not fresh validation again.

Differential Rust tests compare the new loops with the original algorithms,
including callback acceptance/reset schedules, ordered alignment candidates
and work counts. Word-edge tests cover every width from 1 to 257, arbitrary
byte values, row boundaries and repeated cached reads. Public TypeScript crop
expectations were captured before the loop changes. No vectors changed.
The fifth candidate passed 451 JavaScript tests locally (four photo-dependent
tests skipped), 31 Rust tests with all features, the Kotlin suite, an exact
packaged-WASM rebuild and packed-package checks. The M4 photographic run retained 179/184 exact text matches for both
TypeScript and WASM against ZXing's 171/184. Chrome page/worker, host-character-set
and session checks passed on that exact revision; the browser receipt also
records latency samples.

The sixth candidate (`d21f0c2`) also compares four adjacent bytes per word in
TypeScript, using a DataView over the actual typed-array slice. Its independent
edge test covers 3,084 inputs with arbitrary bytes, every width from 1 to 257,
subarray offsets, tail lengths and cached row identity. Two paired M4 prototype
runs showed around 3% less noisy-frame time and 5% less clean-frame time before
integration. The final negative-frame comparison against `44813f9` includes
both direct runs and word comparisons: TypeScript noise cases take 2–8% less
time, and WASM cases take 9–13% less time. These are paired comparisons within
a run; separate-run headline timings are not subtracted to claim gains.

A Kotlin ByteBuffer word prototype was not adopted: kernel results varied
substantially by workload and JVM warm-up, and did not establish a whole-decoder
benefit. Kotlin retains the verified direct-run optimisation. The SIMD-only
Rust compiler experiment was also kept out of the distributed asset; the
accepted word comparisons require no additional WASM feature.

The final source passes all 456 JavaScript tests on M4 with photographs
required, the Kotlin suite with the same photographs, packed-package checks,
and Chrome page/worker and tracked-session checks. The local Rust suite has
31 passing tests with all features. The local JavaScript run passed 452 tests
with the four photograph-dependent tests skipped; the required M4 run fills
that coverage gap. All 192 synthetic outcomes and all 179
previously readable photographs are preserved, with zero text mismatches from
our TypeScript or packaged WASM decoders. The Rust module remains the exact
rebuild already checked for `dc62837`.

The next investigations should measure removable work before adding more
caches or changing search policy:

| Priority | Investigation | Evidence needed before adopting |
|---|---|---|
| 1 | Exact duplicate locator/maps across passes | Repeated identical geometry or matrices account for material time; reuse preserves candidate order, fallback retention and logical budgets. |
| 2 | Repeated vertical walks in overlapping alignment windows | Reuse outweighs setup/storage; clipped-window candidates and work counts remain identical. |
| 3 | Apply the existing mandatory strict-format condition before Reed–Solomon | Neither orientation can pass the existing condition; preserve mirrored precedence, second-look candidates and all outcomes. |
| 4 | Kotlin versus ZXing Java | Same greyscale frames, warmed JVM, alternating order, complete-result checks and pinned versions. Existing test-only ZXing 3.5.3 can be reused. |
| 5 | Independent physical camera evaluation | Android/iOS first-read and p95 latency, difficult lighting/movement, sustained memory/CPU use and false positives. |

The first three are unproven hypotheses, not implemented speedups. The current
M4 WASM results do not establish JVM or phone performance. A win on these finite
suites is not evidence of superiority on every image or over every ZXing
implementation.


## Earlier M1 phase (historical)

Work on `perf/overnight-20261115` started at `91dd037`. The core changes and
WASM package are at `dae4913`; final benchmark tooling and results accompany
this report. The encoder is faster, failed decoder candidates are cheaper,
and repeated camera frames can reuse storage and search the previous region.
The measurements show useful wins, **not superiority over every QR library**.
ZXing remains substantially faster on random noise and reads more of the new
synthetic stress set.

## Delivery

- [x] Reproducible before/after benchmarks with build identities, warm-up,
  interleaved samples, medians/p95 and full-result validation.
- [x] Faster mask selection with identical matrices and tie-breaking in
  TypeScript, Kotlin and Rust; independent reference-scorer tests.
- [x] Incremental block extraction rejects failed candidates sooner in all
  three ports. A targeted regression dropped from 29,714 module reads to
  fewer than 1,024. No conformance vectors changed.
- [x] Optional `createDecoder()` camera session: independent storage, current
  pixels, tracked-region search, same-call full-frame fallback and reset.
- [x] Optional `@forgesworn/qr/wasm` entry: bundled asset, full results,
  reusable input allocation, copied outputs, reset, disposal and provenance.
- [x] Per-photograph regression gate and independently encoded synthetic
  evaluation; comparisons with jsQR, ZXing-WASM, node-qrcode and native Chrome.
- [x] Local TypeScript, Kotlin, Rust, WASM, browser and packed-package checks.
- [x] Implementation reviewed and hosted checks passed, including an exact
  Linux WASM rebuild. The PR tracks the final documentation/tooling revision.
- [x] Task-created build/cache output removed; reproducible results retained
  in the repository. Temporary runner logs are removed at final close-out.

This library change adds no hosted service, telemetry, camera access or automatic
network request. No runtime dependency was added. Rival packages were installed
only in disposable external scratch. Publication remains through the existing
release workflow; no version has been published by this task.

## Method and reproducibility

Measurements are on Apple M1 with Node 24.21.0 and headless Chrome 157 on macOS.
The host was busy: one-minute load around 10–17 during the final runs. Each
latency comparison uses five warm-up rounds followed by 25 rounds with the
implementation order alternated or rotated. Encoding batches ten operations;
decoding times a complete returned result. I/O, image conversion, module
compilation and loading happen outside steady-state timing. These are paired
desktop measurements, not phone, thermal, camera-pipeline or sustained-load claims.

[Machine-readable results](benchmarks/2026-11-16/) include medians, p95, runtime,
source/build identities and workload hashes. The benchmark files intentionally
retain their original `dirty` and revision fields: the tooling was uncommitted
when measured. The compiled JavaScript was subsequently verified identical to
`dae4913`, SHA-256
`36ae22acdff56795d71e93e0421c8a2b2df850b2d72f28d7f74cd22323cacf11`.
Baseline compiled JavaScript from `91dd037`:
`03136b587f23b3a08301ea7d6715dca2f1246ec94617a08ca135c8440e677d48`.
The packaged module's source/compiler/binary hashes are in
[wasm/manifest.json](wasm/manifest.json).

```bash
npm run build
node scripts/performance.mjs --baseline /path/to/baseline/dist
node scripts/performance.mjs --suite session

# External evaluation only; do not add these packages to this repository.
npm install --prefix /tmp/qr-rivals --ignore-scripts --no-audit --no-fund --save-exact zxing-wasm@3.1.7 qrcode@1.5.4
npm run fetch-photos
node scripts/compare-libraries.mjs /tmp/qr-rivals > libraries.json
CHROME=/path/to/chrome node scripts/check-browser.mjs > browser.json
```

The comparison runner needs Node 24 for its test-only PNG reader's TypeScript
import. Default browser/Node package support remains Node 22.13+ / ES2022.
Remove the disposable rival directory after recording results. The browser
runner removes its own profile and stops its browser/server, including on failure.

Before/after comparisons check all public result fields. Rival decoders return
different metadata and point conventions, so timing comparisons check the common
payload text and bytes while still obtaining each library's complete result.
Native BarcodeDetector exposes text and corner points, not equivalent byte/ECI
metadata, and is compared on text only. Native timings include creating its
ImageData wrapper. Encoder comparisons check decoded bytes and symbol sizes;
all four workloads chose the same version, dimensions and mask across encoders.

## Before and after

Median milliseconds; baseline is the original TypeScript at `91dd037`.

| Workload | Baseline | Current | Ratio |
|---|---:|---:|---:|
| Encode URL | 0.182 | 0.134 | 1.36x |
| Encode mixed text | 0.819 | 0.627 | 1.31x |
| Encode 1,000 digits | 1.680 | 1.285 | 1.31x |
| Encode bytes, version 40 | 6.752 | 4.678 | 1.44x |
| Decode clean RGBA | 7.898 | 7.737 | 1.02x |
| Decode blank RGBA | 10.478 | 11.194 | 0.94x |
| Decode noise RGBA | 191.867 | 116.852 | 1.64x |

The blank frame was about 0.7 ms slower in this run; this is not a claim of an
improvement for every input. The encoder and noisy-frame gains were consistent
with the earlier paired run. Clean decoding is largely unchanged.

The separate session comparison uses the current stateless decoder as baseline:

| Repeated frame | Stateless | Session | Ratio |
|---|---:|---:|---:|
| Clean grey | 3.841 | 1.040 | 3.69x |
| Clean RGBA | 8.112 | 1.449 | 5.60x |
| Blank RGBA | 11.035 | 11.181 | 0.99x |
| Noise RGBA | 114.874 | 117.025 | 0.98x |

This measures repeated static frames after acquisition. Movement, changed text,
blank replacement, dimension changes, polarity, padded planes and independent
sessions have correctness tests, but these figures do not measure a moving
camera. Cropping can change location estimates and which of several codes is
selected. A miss adds a crop search before the normal full-frame search.

## Other libraries

Pinned rivals: jsQR 1.4.0, zxing-wasm 3.1.7 and qrcode 1.5.4.
ZXing uses QR-only format selection, one symbol, `tryHarder`, rotation, inversion
and downscaling, and plain-text output. jsQR attempts both polarities. These
settings and default search strategies are documented by the
[ZXing-WASM project](https://github.com/Sec-ant/zxing-wasm) and
[node-qrcode project](https://github.com/soldair/node-qrcode).

Full-result Node decoding, median milliseconds, identical 1280x720 RGBA:

| Frame | Our TypeScript | Our WASM | jsQR | ZXing-WASM |
|---|---:|---:|---:|---:|
| Clean code | 8.367 | 3.370 | 20.858 | 3.811 |
| Blank | 12.043 | 4.825 | 30.332 | 3.997 |
| Random noise | 133.317 | 58.731 | 1894.684 | 13.853 |

Encoding, median milliseconds, automatic mask and level M:

| Payload | Our TypeScript | Our WASM | node-qrcode |
|---|---:|---:|---:|
| URL | 0.147 | 0.094 | 0.300 |
| Mixed text | 0.635 | 0.394 | 1.109 |
| 1,000 digits | 1.302 | 0.839 | 2.047 |
| Bytes, version 40 | 4.456 | 2.945 | 8.784 |

Chrome desktop, median milliseconds, same frames:

| Frame | Our TypeScript | Our WASM | Native BarcodeDetector |
|---|---:|---:|---:|
| Clean code | 5.8 | 3.1 | 14.0 |
| Blank | 8.9 | 4.5 | 9.4 |
| Random noise | 111.2 | 53.4 | 9.9 |

Our module is 195,192 bytes, 68,444 with gzip level 9. ZXing's reader module is
946,598 bytes, 412,504 gzipped. This is not feature equivalence: ZXing supports
many barcode formats and more character sets. Neither number includes its JS
wrapper or HTTP headers. The default TypeScript entry does not fetch WASM.

## Accuracy, including the limits

Exact expected-text matches, with mismatches reported separately from misses:

| Corpus | Our TypeScript | Our WASM | jsQR | ZXing-WASM |
|---|---:|---:|---:|---:|
| Existing 184 photographs | 179 | 166 | 155 | 171 |
| New 96 synthetic frames | 84 | 84 | 80 | 89 |

On the photographs, TypeScript has no text mismatch and preserves all 179
previously read photos. WASM has 12 text mismatches and six misses. All 12
mismatches were separately verified to have identical raw bytes and ECI to the
TypeScript result: they expose the documented Rust character-set fallback,
not equivalent rendered text. Hanzi is refused; kanji and unsupported ECI text
are not fully supported. jsQR has 11 text mismatches and 18 misses; ZXing has
one text mismatch and 12 misses. A text mismatch alone does not establish a
wrong raw payload. IDs are retained in `libraries.json`; its `wrong` field
means an exact expected-text mismatch.

The 184 photographs are the existing hash-pinned regression set, **not held-out
camera data**. The 96 new frames use symbols from node-qrcode, seed `0x783fa126`,
rotation, shear, varying scale/contrast, grain, some blur and inversion. Some
rotated symbols extend beyond the frame. Their generator was fixed before the
results were inspected; no decoder tuning followed those results. None of the
four implementations returned incorrect text on that set. It is independently
encoded synthetic evidence, not a new photographic corpus or a universal ranking.

## SIMD experiment

A separate candidate used the same Rust 1.94.1 sources with
`-C target-feature=+simd128`, remapped source paths and stripped symbols, reusing
the worktree's Rust target directory. The normal asset was restored and verified
after the experiment. `scripts/compare-wasm.mjs /path/to/candidate.wasm` compares
full results before alternating timings; hashes and results are in `simd.json`.
The candidate improved the three medians by roughly 4–12% in the final run,
with a slightly worse clean-frame p95. It was not included: the modest desktop
gain does not yet justify a second asset, compatibility fallback and another
supported configuration. No SIMD phone-performance claim is made.

## Verification and next evidence

- TypeScript: typecheck and 425 tests passed, including the required 184-photo
  suite, per-photo preservation and repeated session reads with fresh pixels.
- Rust: 24 tests passed. Kotlin: the full suite passed earlier against the same
  Kotlin source; the final Gradle run found it up to date.
- WASM: 148 encoder vectors, 58 frames / 464 work counters and 419 option
  comparisons match. The public adapter additionally checks complete results,
  headers, modes, errors, independent instances and ownership after disposal.
- Memory: 5,000 legacy-adapter rounds stayed at 1,376,256 bytes after warm-up;
  the deliberately leaking control grew. The packaged adapter's mixed reset,
  read and failure loop also stayed flat after warm-up.
- Distribution: a real npm tarball was installed into an isolated consumer;
  main/WASM exports, binary bytes, full results and disposal passed. Chrome
  page and worker reads passed using the served asset. The WASM entry alone
  loaded only its image/error helpers, not the TypeScript encoder or decoder.
- The pinned Rust asset rebuild matches locally and on Linux. All five hosted
  jobs passed for implementation revision `dae4913`: Node 22.13, Node 24,
  photographs (TypeScript and Kotlin), Rust/WASM and Kotlin.
  [Hosted evidence](https://github.com/forgesworn/qr/actions/runs/43781284813).

The next useful investigations are bounded noisy-frame work without losing hard
reads, better recovery on unseen camera frames, and full character-set support
for the optional WASM backend. Phone measurements need actual Android/iOS devices
and a fresh, consented camera corpus. Those are explicitly outstanding evidence,
not results established by these desktop tests.

## Delivery state

[PR #4](https://github.com/forgesworn/qr/pull/4) contains the implementation,
reproduction scripts and results. The PR's current checks are the authority for
its final documentation/tooling revision. No merge or npm publication is part of
this handover. No physical-device or fresh camera-corpus result is claimed.

All comparative results needed for review are committed under `benchmarks/`;
`wasm/` retains the distributed binary and provenance. The task-created photograph
cache, `rust/target`, `kotlin/core/build` and local Kotlin caches were removed
after verification. Pre-existing `dist`, `node_modules`, shared caches, the main
checkout/branch and neighbouring `qr-release` worktree were preserved. Temporary
runner logs under `/tmp/qr-performance-Eoi9WV` are removed when the final CI wait
ends; the PR handover records close-out. Browser runners stopped their own
browser/server and removed profiles; no emulator or fixture was started.
