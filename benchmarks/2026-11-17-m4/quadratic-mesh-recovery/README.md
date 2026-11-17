# Quadratic mesh recovery

Baseline: QR 0.3.13, commit `b1d95074fb442d87004be1c8bd22b8d8e5c8646f`.
Candidate: QR 0.3.14. Source and emitted JavaScript identities are frozen in
`qualification.json`; the packaged build is bound by `production-binding.json`.
The independent qrcode 1.5.4 encoder and ZXing-WASM 3.1.7 are isolated benchmark
tools, never QR runtime or project dependencies.

## Policy, accuracy and limits


The new fallback retains the first fully measured 3×3 alignment lattice encountered during an existing full-size late refinement. It preserves the six measured offsets and jointly fits the three synthetic corners so the surface remains anchored at the actual finder centres. After all earlier recovery paths fail, it samples one quadratic grid. It inspects the candidate orientation and then the opposite orientation, selects the first pair of agreeing format copies within two errors each, and performs one unchanged symbol read. A failed read does not try another orientation or descriptor.

| Synthetic curve scope | 0.3.13 | QR 0.3.14 | ZXing-WASM 3.1.7 |
| --- | ---: | ---: | ---: |
| Earlier 1,120 cases | 653 | 743 | 569 |
| Separately frozen 256 cases | 65 | 118 | 77 |
| Combined 1,376 cases | 718 | 861 | 646 |

QR 0.3.14 adds 143 exact reads and preserves every earlier complete successful result and input image. QR returned no wrong payload. There are 229 QR-only reads and 14 ZXing-only reads in the combined set; the latter comprise nine earlier cases and five from the new validation set. These are finite synthetic comparisons, not a claim that QR reads every code ZXing can read.

The 256 validation frames were frozen before their candidate evaluation, with pixels and payloads disjoint from the earlier 1,120. They use versions 8, 10, 11 and 12, scales 2 and 3, both signs and axes, and four explicitly rendered profiles. Version dimensions overlap earlier work; this is not a wholly unseen-version study. The evaluated frames are now regression data. Each profile contributes 64 cases:

| New synthetic profile | 0.3.13 | QR 0.3.14 | ZXing-WASM 3.1.7 |
| --- | ---: | ---: | ---: |
| Parabola | 32 | 61 | 27 |
| Circular arch | 11 | 32 | 23 |
| Cubic skew | 22 | 25 | 27 |
| Double wave | 0 | 0 | 0 |

The cubic-skew subset still favours ZXing, and neither reader succeeds on this double-wave subset. These mathematical renderings do not establish physical-camera or arbitrary-surface accuracy.

The separate 888-case regression preserves the earlier correct counts: photographs 180/184, stress positives 172/224, previously qualified positives 69/128, validation 174/192 and synthetic 92/96. All 64 negative controls remain rejected. On photographs, pinned ZXing reports 171 correct, 12 misses and one wrong payload; QR reports 180 correct, four misses and no wrong payload. Do not describe that single finite photo comparison as a universal false-positive rate.

The retained descriptor contains 18 doubles (144 logical bytes), plus candidate/location metadata. Its version 7–13 scope bounds the extra active grid and bilinear samples to 69² = 4,761. The existing conservative retained-grid bound remains 281,961 module bytes; it excludes this active grid, descriptor/metadata, threshold buffers, temporaries and allocator capacity. No peak-heap claim follows from these figures.

Legacy Work remains equal across these comparisons because it measures the existing search/refinement paths. The new threshold computation, sampling and symbol read are deliberately separate: **at most eight legacy second looks plus one terminal pass**, not unchanged total work. Successful earlier paths can still pay for the bounded offset snapshot.


## Production verification

The packaged WASM is **261,831 bytes**, 8,908 bytes larger than 0.3.13,
SHA-256 `022993bfb6895152421aaf22673484c8d6fb60be3edae44d5eb85c927f28e326`.
Its Rust/build source SHA-256 is
`bcef67af506d43ebf88b4dd6d6e5f1f61620a13687ea02bb4374a84e8c708fa9`.
All 2,264 curved and regression inputs have equal public TypeScript/WASM
results. Only location points are normalised to their documented x/y fields;
internal TypeScript finder bookkeeping is not part of the WASM API. All other
fields are compared, including bytes, corrections, ECI and orientation.
Earlier TypeScript successes are compared as raw complete results.
Input preservation for the packaged comparison combines the qualified
TypeScript per-reader check, byte-identical production JavaScript and the
check after the packaged WASM call.

Related photograph transformations remain **2,872/2,944** correct with no
wrong payloads. The curved-sheet set improves from **10/18 to 12/18**.
Every earlier complete successful result and legacy Work counter is preserved.
Photo transformations are related views of 184 photographs, not independent
photographs. Their oracle supplies exact expected text rather than independently
supplied raw payload bytes.

All **516 TypeScript tests** with required photographs, **123 Kotlin tests**,
and **49 Rust tests plus one doctest** pass. Rust default and all-feature
configurations both pass. Five newly generated official conformance frames
bring the pack to 89; all 84 previous frame entries and other pack sections
remain unchanged. All five new regression fixtures fail on exact 0.3.13
JavaScript and pass with the candidate. Their portable source is
`test/quadratic-mesh-fixture.ts` in the release checkout;
`own-fixture-red.json` records the original failing-baseline check.

Standalone WASM matches 89 pack frames, 712 Work counters, 2,000 option
comparisons and all 148 encoder vectors. Native/standalone module-grid and
renderer comparisons pass. Its 1,000-round lifetime check, after 384 warm-up
calls across 24 recovery fixtures, remains at 5,242,880 bytes of linear-memory
capacity; deliberately unfreed handles grow the control. This measures capacity,
not peak live heap. The packaged build also passes Chrome, worker, six host
character-set cases and session/reset checks. These are desktop browser checks,
not physical-camera acceptance.

## Reproduce

Run task builds and timings sequentially. Use native Node 24.21.0 on the M4
for comparable measurements, the pinned Rust compiler for the packaged WASM,
and a JDK for Kotlin. Keep rival dependencies outside the project: copy
`rivals-package.json` and `rivals-package-lock.json` to a new rivals directory
as `package.json` and `package-lock.json`, then run `npm ci --ignore-scripts`.
Build a separate clean baseline checkout at the commit above with `npm ci`,
`npm run build` and `npm run fetch-photos`; fetch the `v0.3.13` tag too.
Use a separate 0.3.14 checkout for the candidate.

[The portable bootstrap instructions](archive-prep/README.md) describe how to
copy the unchanged helpers into a new scratch directory, preserve original
receipts separately, reproduce the hash-checked prototype build and run all
1,376 curve and 888 regression comparisons. The bootstrap and compiled source
identity were independently replayed successfully (`bootstrap-check.json`).
The broad decode suites were not repeated just to test the bootstrap.

Keep the original `validation-manifest.json`. The 256 inputs were frozen
before their candidate evaluation and checked disjoint from the earlier 1,120 pixels
and payloads. Replaying them does not make them unseen again.
The original 87 MB observer trace is not distributed; production accuracy,
public result parity and performance claims rely on the archived fixtures,
source identities and compact receipts, not that diagnostic trace.

Production helpers verify every source/JavaScript hash and the packaged binary
before decoding. They refuse existing output paths. Preserve an unsuccessful
run separately, investigate it and use a new output path for a valid rerun.
An exit status of zero and a complete passing receipt are both required.

## Measured timings

Two independent processes per backend ran sequentially on the Apple M4 Max,
using native arm64 Node 24.21.0. Each of the 20 paired cases has 60 alternating
measured pairs after at least ten warm-up pairs and 500 ms. Full result and
input assertions run outside the timed call. This is a working desktop with
other applications open; no task-owned QR build, test or benchmark ran
concurrently. These results do not establish mobile performance or worst-case
latency.

The workload includes all five original target gains, seven other gains
including circular-arch and cubic-skew examples, three prior successes,
two confirmed terminal-sampling misses and clean/blank/noise controls.
The copied-source observer examined 228 frozen cases, preserving production,
hooks-off and hooks-on complete results, Work and pixels. It selected the first
two actual terminal-sampling misses and first descriptor-retaining earlier
success; `timing-audit.json` binds their exact inputs. Timed decoders contain
no observer hooks. Every earlier successful result remains identical.

Across the twelve sampled new reads, WASM median latency changes by
**+0.18% to +4.27%**, and TypeScript by **+0.66% to +6.06%**, relative to the
earlier misses. The two confirmed terminal misses change by **+0.10% to +1.53%**
for WASM and **+1.24% to +2.04%** for TypeScript. The descriptor-retaining
prior success changes by **−0.51% to +1.38%** for WASM and **+0.23% to +0.88%**
for TypeScript. These are ranges across cases and both processes, not an
aggregate throughput result. The trade-off is more exact reads at a measured
additional cost on these hard inputs.

### Paired WASM

| Case | Role | 0.3.13 median range, ms | 0.3.14 median range, ms | Median change, fork 1 / 2 | p95 change, ms, fork 1 / 2 |
|---|---|---:|---:|---:|---:|
| clean | fixed | 1.532–1.535 | 1.508–1.535 | -1.53% / +0.03% | -0.033 / -0.019 |
| blank | fixed | 1.193–1.208 | 1.174–1.206 | -1.58% / -0.14% | -0.018 / -0.026 |
| noise | fixed | 20.488–21.316 | 20.416–21.295 | -0.35% / -0.10% | -0.091 / +0.048 |
| boundary-unseen-0 | retained-prior-success | 3.965–4.140 | 3.944–4.198 | -0.51% / +1.38% | -0.005 / -0.022 |
| boundary-unseen-2 | gain | 6.024–6.324 | 6.060–6.390 | +0.61% / +1.05% | +0.100 / +0.045 |
| boundary-unseen-8 | gain | 3.602–3.766 | 3.701–3.876 | +2.76% / +2.92% | +0.095 / +0.081 |
| mesh-retain-unseen-9 | gain | 1.614–1.744 | 1.646–1.818 | +1.97% / +4.27% | +0.013 / +0.089 |
| starvation-holdout-1 | terminal-miss | 3.529–3.802 | 3.583–3.806 | +1.53% / +0.10% | +0.034 / +0.071 |
| starvation-holdout-3 | terminal-miss | 3.516–3.686 | 3.567–3.736 | +1.44% / +1.33% | +0.047 / +0.056 |
| starvation-holdout-4 | gain | 8.544–8.598 | 8.574–8.743 | +0.35% / +1.69% | +0.098 / +0.122 |
| starvation-holdout-16 | gain | 10.728–11.211 | 10.869–11.323 | +1.32% / +0.99% | +0.114 / +0.196 |
| starvation-holdout-42 | prior | 14.498–14.856 | 14.573–14.971 | +0.52% / +0.77% | +0.091 / +0.010 |
| alternate-grid-holdout-16 | gain | 1.600–1.626 | 1.628–1.676 | +1.74% / +3.11% | +0.063 / +0.072 |
| alternate-grid-holdout-18 | gain | 1.773–1.850 | 1.815–1.858 | +2.36% / +0.44% | +0.134 / +0.058 |
| header-rediscovery-holdout-16 | gain | 4.564–4.602 | 4.675–4.711 | +3.22% / +1.59% | +0.202 / +0.132 |
| header-rediscovery-holdout-18 | gain | 3.509–3.560 | 3.619–3.643 | +2.34% / +3.13% | +0.060 / +0.107 |
| selected-mesh-holdout-0 | gain | 9.394–9.431 | 9.435–9.525 | +1.00% / +0.44% | +0.115 / +0.087 |
| selected-mesh-holdout-39 | prior | 26.432–26.638 | 26.387–26.603 | -0.17% / -0.13% | +0.076 / -0.034 |
| small-parabola-validation-10 | gain | 8.686–8.689 | 8.721–8.744 | +0.40% / +0.64% | +0.091 / +0.101 |
| small-parabola-validation-15 | gain | 8.086–8.298 | 8.181–8.313 | +1.16% / +0.18% | +0.071 / +0.099 |

### Paired TypeScript

| Case | Role | 0.3.13 median range, ms | 0.3.14 median range, ms | Median change, fork 1 / 2 | p95 change, ms, fork 1 / 2 |
|---|---|---:|---:|---:|---:|
| clean | fixed | 3.847–3.957 | 3.889–3.935 | +1.11% / -0.56% | +0.002 / +0.114 |
| blank | fixed | 2.947–2.972 | 2.929–2.963 | -0.59% / -0.31% | +0.058 / +0.445 |
| noise | fixed | 51.891–52.578 | 51.985–52.828 | +0.18% / +0.48% | -0.873 / -0.771 |
| boundary-unseen-0 | retained-prior-success | 10.206–10.292 | 10.229–10.383 | +0.23% / +0.88% | +0.008 / +0.012 |
| boundary-unseen-2 | gain | 14.669–14.830 | 14.903–15.186 | +1.59% / +2.40% | +0.106 / +0.005 |
| boundary-unseen-8 | gain | 8.579–8.631 | 8.792–8.886 | +2.49% / +2.96% | +0.146 / +0.279 |
| mesh-retain-unseen-9 | gain | 4.108–4.118 | 4.272–4.368 | +6.06% / +4.01% | +0.136 / +0.205 |
| starvation-holdout-1 | terminal-miss | 8.948–9.066 | 9.096–9.251 | +1.66% / +2.04% | +0.359 / +0.191 |
| starvation-holdout-3 | terminal-miss | 8.774–8.824 | 8.933–8.944 | +1.95% / +1.24% | +0.138 / +0.213 |
| starvation-holdout-4 | gain | 21.465–21.613 | 21.689–21.853 | +1.04% / +1.11% | +0.189 / +0.112 |
| starvation-holdout-16 | gain | 24.934–24.938 | 25.150–25.222 | +0.85% / +1.16% | +0.520 / +0.358 |
| starvation-holdout-42 | prior | 34.795–34.991 | 34.858–35.048 | +0.18% / +0.16% | +0.031 / -0.020 |
| alternate-grid-holdout-16 | gain | 3.854–3.917 | 4.020–4.052 | +3.45% / +4.31% | +0.158 / +0.189 |
| alternate-grid-holdout-18 | gain | 4.091–4.112 | 4.292–4.302 | +5.14% / +4.38% | +0.157 / +0.182 |
| header-rediscovery-holdout-16 | gain | 10.492–10.516 | 10.750–10.781 | +2.22% / +2.75% | +0.285 / +0.221 |
| header-rediscovery-holdout-18 | gain | 7.939–7.946 | 8.166–8.167 | +2.76% / +2.87% | +0.300 / +0.216 |
| selected-mesh-holdout-0 | gain | 20.902–21.037 | 21.179–21.299 | +1.24% / +1.32% | -0.031 / +0.192 |
| selected-mesh-holdout-39 | prior | 61.822–61.992 | 62.116–62.202 | +0.34% / +0.48% | +0.066 / +0.831 |
| small-parabola-validation-10 | gain | 20.023–20.033 | 20.291–20.465 | +1.29% / +2.21% | +0.567 / +0.481 |
| small-parabola-validation-15 | gain | 18.761–18.969 | 19.094–19.104 | +0.66% / +1.83% | +0.165 / +0.446 |

### Direct packaged-WASM comparison

Both libraries receive the same three fixed 1280 × 720 RGBA frames, including
their public wrappers. ZXing-WASM 3.1.7 uses QR-only decoding with try-harder,
rotation, inversion and downscaling enabled, one symbol and plain text. Its
binary SHA-256 is `33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59`.
Each of two sequential processes uses the same 60-pair/warm-up contract.

| Fixed frame | QR 0.3.14 WASM median | ZXing-WASM 3.1.7 median | QR p95 | ZXing p95 |
|---|---:|---:|---:|---:|
| Clean | 1.595–1.618 ms | 2.016–2.027 ms | 1.703–1.703 ms | 2.181–2.186 ms |
| Blank | 1.216–1.238 ms | 2.231–2.237 ms | 1.282–1.347 ms | 2.315–2.340 ms |
| Noise | 21.304–21.321 ms | 8.013–8.079 ms | 21.708–22.651 ms | 8.316–8.405 ms |

QR is faster on these clean and blank frames. Random-noise rejection remains
about 2.6× slower than ZXing. Neither the accuracy gain nor unchanged legacy
Work implies a general speed improvement.

### Repeat timings

After assembling the verified production directory described above, follow
[timing-prep/README.md](timing-prep/README.md). Set
`QR_EXPECTED_WASM_SHA256=022993bfb6895152421aaf22673484c8d6fb60be3edae44d5eb85c927f28e326`
and `QR_EXPECTED_WASM_BYTES=261831`; use the exact 0.3.13 binary saved in
`released-dist/qr.wasm`. Recreate the copied-source classification audit,
then run two fresh processes each for TypeScript, WASM and the direct comparison.
Use new output paths and retain successful completion alongside all six raw
receipts. The archived `timing-summary.json` derives medians and nearest-rank
p95 values from all 60 raw samples per reader/case. WASM capacity fields are
linear-memory capacity, not live allocations or peak heap.
