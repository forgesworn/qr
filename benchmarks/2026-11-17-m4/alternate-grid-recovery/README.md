# Alternate reading of existing grids — M4 evidence

Baseline: QR 0.3.10, commit
`8360eb3b648ebc1d9439684a9f643cc1fb162713`.
Candidate: QR 0.3.11, bound to source and generated JavaScript hashes in the
receipts. Packaged WASM: 246,322 bytes, SHA-256
`66b4a41067266e3a5e804de4f09dc6dc3c89c97f9bd29105343d1a249a9aa01f`.
Independent qrcode 1.5.4 and ZXing-WASM 3.1.7 are benchmark tools installed in
separate scratch; neither becomes a QR dependency.

After a full-size late refinement fails, retain the first eligible alternate
orientation and format hypothesis for its existing final grid. Match finite
matrix coefficients, size, polarity and luminance basis exactly. Keep its mesh
only when the existing call already captures one. A later matching late attempt
invalidates the slot; it is never replaced. After every earlier path fails,
strictly validate the saved final grid and, if necessary, the saved mesh.

This adds no finder, map, secondary attempt, alignment probe or image sampling.
It can add two strict symbol validations, including Reed–Solomon work, which
the existing Work counters do not measure. The maximum remains eight attempts,
720 maps and 11,500,000 alignment probes. The saved pair contains at most 62,658
module bytes; a conservative combined retained-grid bound is 219,303 bytes.
Active refinement buffers, metadata and allocator capacity are additional.

## Accuracy and validation

| Dataset | QR 0.3.10 | Candidate | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Earlier 96 curved images | 48 | 48 | 42 |
| Earlier 128 curved images | 108 | **109** | 106 |
| Previous 128-image holdout | 63 | **64** | 52 |
| Separate 128-image holdout | 72 | 72 | 67 |
| Previous frozen 128 images | 80 | 80 | 70 |
| Version-peer frozen 128 images | 67 | 67 | 53 |
| New 128 images frozen before evaluation | 62 | 62 | 57 |
| Total curved images | 500/864 | **502/864** | 447/864 |
| Original photographs | 180/184 | 180/184 | 171/184 |
| Related photo views | 2,872/2,944 | 2,872/2,944 | — |
| Curved sheets | 10/18 | 10/18 | — |

The prototype preserves every earlier complete result, metadata, Work counter
and input pixel across all 864 curves, 888 regressions, 2,944 photograph views
and 18 sheets. It rejects all 64 negative controls; no wrong QR payload is
observed. The new 128 images were frozen before evaluation with no repeated
pixels or payloads from the previous 736. They are now regression data.
Photograph transformations are related views, and their independent oracle
supplies expected text rather than raw payload bytes. These finite datasets
do not establish universal accuracy or performance on a particular camera.

The original diagnostic covers 34 successful controls and all 15 remaining
ZXing-only cases. One strict replay recovers case 90 from its existing final
grid. Both version words and both format words are exact, with zero corrected
codewords. The bounded streaming selector reproduces that result on the same
49 cases. Unlike the original observer, it cannot skip an invalidated slot and
choose a later one; the production policy deliberately does not backfill.
Broader qualification also recovers `starvation-holdout-40`.

The own-encoder case-90 fixture exactly reproduces the independent pixels.
It fails on 0.3.10 and passes with unchanged Work on the candidate. Its real
Vitest regression was observed failing before integration and passing after.
The officially regenerated conformance pack adds that frame and preserves all
79 earlier entries exactly. All 507 TypeScript tests with required photographs,
49 default-feature native Rust tests plus one doctest, and 123 Kotlin tests pass.

Final packaged parity passes all four suites. All-feature Rust tests, standalone
WASM encoding, native grid/rendering parity and 1,541 option comparisons pass.
The 80-frame pack matches all 640 Work counters. Browser, worker, character-set
and session/reset checks pass. Over 1,000 allocation-test rounds, capacity stays
at 5,242,880 bytes after a 240-round warm-up covering all 15 recovery fixtures.
The unfreed-handle control grows. This differs from the previous release
workload and measures capacity, not peak live allocation.

## Timing

Two independent paired processes per backend ran sequentially on the Apple M4 Max with native Node 24.21.0. Each covers 40 cases with 60 alternating measured pairs after at least ten warm-up pairs and 500 ms. Assertions and input hashing run outside the timed decoder call.

| Case | WASM 0.3.10 median range | WASM 0.3.11 median range | Paired change |
|---|---:|---:|---:|
| alternate-known-90 | 40.10–40.16 ms, miss | 40.25–40.29 ms, read | +0.47% and +0.22% |
| alternate-previous-40 | 21.50–21.53 ms, miss | 21.59–21.71 ms, read | +0.87% and +0.41% |
| known-version-peer-miss-55 | 36.69–36.82 ms, miss | 36.76–37.00 ms, miss | +0.86% and -0.16% |
| holdout-version-peer-miss-37 | 18.26–18.29 ms, miss | 18.22–18.33 ms, miss | +0.37% and -0.37% |
| fresh-version-peer-miss-45 | 16.16–16.18 ms, miss | 16.08–16.18 ms, miss | -0.00% and -0.50% |
| fresh-version-peer-miss-61 | 25.05–25.07 ms, miss | 25.01–25.15 ms, miss | +0.37% and -0.23% |
| fresh-version-peer-miss-77 | 31.76–31.85 ms, miss | 31.79–31.82 ms, miss | +0.19% and -0.16% |

WASM new-read median changes are 0.22–0.87% relative to their earlier misses; the five existing persistent-miss controls change by -0.50–0.86%. Main-noise medians change by +0.42% and -0.05%, clean by +0.74% and +0.44%, and blank by -1.18% and -0.29%. Existing curved-success median changes range from -0.39% to +0.81%. Clean p95 changes by -0.00 ms and +0.01 ms. These results do not establish a general speed improvement.

TypeScript new-read median changes are 0.06–0.64% relative to their earlier misses; the five existing persistent-miss controls change by -0.60–0.53%. Main-noise medians change by +0.25% and -0.55%, clean by -3.48% and +1.38%, and blank by +0.15% and -0.32%. Existing curved-success median changes range from -1.30% to +1.28%. Clean p95 changes by -0.20 ms and +0.05 ms. These results do not establish a general speed improvement.

The paired WASM runs finish with baseline/candidate linear-memory capacities of 14,483,456/14,483,456 bytes; 14,483,456/14,483,456 bytes. Capacity is not peak live allocation. Raw samples and p95 values are retained. Desktop measurements do not establish mobile latency or worst-case time bounds.

| Fixed frame | QR 0.3.11 WASM median | ZXing-WASM 3.1.7 median |
|---|---:|---:|
| Clean QR | 1.517–1.519 ms | 1.892–1.896 ms |
| Blank | 1.161–1.165 ms | 2.125–2.129 ms |
| Random noise, no QR | 20.334–20.342 ms | 7.739–7.742 ms |

WASM median changes for the two new reads range from +0.22% to +0.87% relative to the earlier misses. Existing successful-case median changes range from -0.39% to +0.81%. These measurements do not establish a general speed improvement or the worst-case extra symbol-validation cost.

## Reproduce

Run builds and measurements sequentially on the same machine. Use Node 24,
the repository's pinned Rust compiler and a JDK. Keep rival packages in scratch.
For the frozen prototype, create a clean checkout at the baseline commit and
run `npm ci`, `npm run build` and `npm run fetch-photos` there. Copy the helpers
and manifests into a scratch helper directory. Install its `rivals-package.json`
and lock file as `rivals/package.json` and `rivals/package-lock.json` with
`npm ci --ignore-scripts`.

From the helper directory, with absolute baseline and rival paths:

```sh
python3 prototype.py BASELINE 8360eb3b648ebc1d9439684a9f643cc1fb162713 candidate-source
node build-candidate.cjs BASELINE candidate-source qualification-build
node qualify.mjs BASELINE qualification-build RIVALS new-qualification.json 8
node regression.mjs BASELINE qualification-build RIVALS new-regression.json
node photos.mjs BASELINE qualification-build new-photos.json
node sheet.mjs BASELINE qualification-build RIVALS new-sheet.json
node own-fixtures.mjs BASELINE qualification-build CURRENT/test/alternate-grid-fixture.ts RIVALS new-own-fixtures.json
```

Keep the committed fresh manifest; `freeze-next.mjs` records its original
pre-evaluation generation and disjointness without importing a decoder.
The actual-tsconfig builder checks both source copies before emission and
requires baseline JavaScript to match the released receipt exactly.

For the integrated current checkout, build WASM and JavaScript, fetch the
photographs, then use the qualified prototype snapshot above:

```sh
node build-production.cjs CURRENT candidate-source production-build
node verify-build.mjs CURRENT production-build qualification-build new-binding.json
node verify-qualified.mjs CURRENT production-build RIVALS new-production-curves.json 8
node verify-backends.mjs CURRENT production-build RIVALS regression.json new-production-backends.json
node verify-photos.mjs CURRENT production-build new-production-photos.json
node verify-sheet.mjs CURRENT production-build RIVALS new-production-sheet.json
```

The production helpers bind current source, every emitted/distributed JavaScript
module and the final WASM manifest and Rust source hash before decoder loading.
Complete public results and pixels are checked. Internal finder metadata is
normalised to the public location's x/y fields for WASM comparisons.

`paired.mjs CURRENT BUILD ts` or `paired.mjs CURRENT BUILD wasm OLD_WASM NEW_WASM`
uses `QR_RIVALS=RIVALS` and measures 40 cases with 60 alternating pairs after
at least ten warm-up pairs and 500 ms. Run two independent processes per backend,
sequentially. Get the old binary from `git show v0.3.10:wasm/qr.wasm`.
The five earlier persistent misses are controls: the 49-case streaming screen
contains no selected alternate that remains a miss, so these timings do not
establish the worst-case extra validation cost. `compare-current.mjs CURRENT
BUILD RIVALS` separately compares packaged QR and ZXing on three fixed frames.

Reuse the checkout's Rust `target/`. Retain wanted receipts and remove only
task-owned scratch; remove a disposable worktree with `git worktree remove`.
