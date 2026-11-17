# Selected mesh recovery

Baseline: QR 0.3.12, commit
`0fdcd6262f0cd5ddcd7ec6bfba5d131df01c9a37`.
Candidate: QR 0.3.13. The qualified copied TypeScript prototype is pinned by
`prototype.py` SHA-256
`df1450b6e39d5dba5d82cef87adab980411f19c8efcf1f14c157605155fedd1e`.
Independent qrcode 1.5.4 and ZXing-WASM 3.1.7 are isolated benchmark tools,
not QR runtime or project dependencies.

## Recovery policy and limits

The existing header-rediscovery path selects the first qualifying final grid
from full-size late refinement, with strict agreement between both format
copies. This change also retains the existing mesh delivered by that same
refinement invocation. It does not create a collector, sample another image
or attach a mesh from a later invocation. A slot already populated on entry
cannot acquire a replacement mesh.

Every earlier success, including the rediscovered final-grid read, keeps
priority. Only after those paths fail does one strict symbol read try the
selected mesh under the same orientation, error-correction level and mask.
Ordinary version, Reed–Solomon and segment validation remain unchanged.

There are no extra finder searches, maps, alignment probes or second looks.
Bounds remain eight second looks, 720 maps and 11,500,000 alignment probes.
The additional format check and possible symbol read are outside the existing
Work counters; unchanged Work is not evidence of unchanged CPU time.

TypeScript and Kotlin retain the existing array. Rust copies only the selected
mesh and shares that ownership if the alternate-grid path selects it too.
The conservative retained-grid bound rises from 250,632 to **281,961 module
bytes**, excluding active buffers, metadata and allocator capacity. This is
not a peak-heap measurement. Shared ownership can reduce actual retention.

## Accuracy

| Dataset | QR 0.3.12 | QR 0.3.13 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Earlier 96 curved images | 48/96 | 48/96 | 42/96 |
| Earlier 128 curved images | 109/128 | 109/128 | 106/128 |
| Previous curved holdout | 67/128 | **68/128** | 52/128 |
| Separate curved holdout | 74/128 | 74/128 | 67/128 |
| Previous frozen set | 81/128 | **82/128** | 70/128 |
| Version-peer frozen set | 69/128 | **70/128** | 53/128 |
| Alternate-grid frozen set | 64/128 | 64/128 | 57/128 |
| Header-rediscovery frozen set | 59/128 | **60/128** | 53/128 |
| New set frozen before evaluation | 77/128 | **78/128** | 69/128 |
| Total curved images | 648/1,120 | **653/1,120** | 569/1,120 |
| Original photographs | 180/184 | 180/184 | 171/184 |
| Related photograph views | 2,872/2,944 | 2,872/2,944 | — |
| Curved sheets | 10/18 | 10/18 | — |

On these 1,120 images, both libraries read 555 correctly. QR alone reads 98,
ZXing alone reads 14, and neither reads 453. The aggregate lead therefore
includes individual images for which ZXing remains the better choice.

Five reads are recovered: `starvation-holdout-42`, `late-phase-holdout-111`,
`version-peer-holdout-58`, `header-rediscovery-holdout-46` and
`selected-mesh-holdout-39`. Four are among the previous 992 images; one is in
the additional 128. Earlier complete successful results, metadata, Work and
input pixels are preserved. The 888-case regression remains unchanged,
including all 64 rejected negative controls, with no wrong QR payload observed.

The additional 128 were frozen before prototype evaluation, with pixels and
payloads disjoint from the earlier 992. Existing transformation families and
version dimensions are not claimed to be wholly unseen. All evaluated inputs
are now known regression data. Photograph transformations are related views;
their independent oracle supplies expected text, not independently supplied raw
payload bytes. These finite datasets do not establish universal accuracy or
performance on a particular camera.

The preceding diagnostic observes 25 cases: three remaining selected-header
misses, all eleven 0.3.12 gains and eleven older successes. Instrumentation
enabled/disabled preserves complete results, Work and input pixels. All three
misses actually deliver a mesh from the selected invocation and pass the strict
format check. `starvation-holdout-42` recovers; `boundary-unseen-95` and
`alternate-grid-holdout-125` still miss. No failing-stage classifier was recorded
for those two misses. Single-use and unconsumed pending-state reset checks pass.

## Production verification

The packaged WASM is **252,923 bytes**, 404 bytes larger than 0.3.12,
SHA-256 `8b75949e2dbf5bf968718a8b776c9a8bb8ad8a5f894c6118686ec95efa8258ad`.
Its Rust/build source SHA-256 is
`88cde179fd1cd5a07623685e5517d5e41c04ea9d846e2766d38cd24b22710b0b`.
Source, emitted/distributed JavaScript, compiler configuration and binary
identities are checked before loading the decoder. Final packaged TypeScript
and WASM results match across 1,120 curves, 888 regressions, 2,944 photo views
and 18 sheets.

All 511 TypeScript tests with required photographs, 123 Kotlin tests and
49 native Rust tests plus one doctest pass; Rust default and all-feature runs
both pass. The official conformance generator adds two frames and leaves all
82 earlier entries and non-frame sections unchanged. Own-encoder fixtures
match the independently generated frozen pixels and reproduce two expected
baseline failures before passing with the change.

Standalone WASM matches 84 frames, 672 Work counters, 1,745 option comparisons
and 148 encoder vectors. Native/standalone module-grid and renderer checks pass.
Its 1,000-round allocation check over 19 recovery fixtures, after 304 warm-up
rounds, stays at 5,242,880-byte linear-memory capacity; the unfreed-handle
control grows. Capacity is not peak live heap. Browser, worker, six character-set
cases and session/reset checks also pass.

## Reproduce

Run builds and measurements sequentially. Use Node 24, the repository's pinned
Rust compiler and a JDK. Keep rival dependencies in scratch. Create a clean
baseline checkout at the commit above, then run `npm ci`, `npm run build` and
`npm run fetch-photos` there. Copy this archive into a scratch helper directory.
Install its `rivals-package.json` and `rivals-package-lock.json` as
`rivals/package.json` and `rivals/package-lock.json` with
`npm ci --ignore-scripts`. Use absolute paths in the following commands.

From the scratch helper directory, recreate the qualified copied prototype:

```sh
python3 prototype.py BASELINE 0fdcd6262f0cd5ddcd7ec6bfba5d131df01c9a37 candidate-source
node build-candidate.cjs BASELINE candidate-source QUALIFIED_BUILD
node qualify.mjs BASELINE QUALIFIED_BUILD RIVALS NEW_QUALIFICATION_JSON 8
node regression.mjs BASELINE QUALIFIED_BUILD RIVALS NEW_REGRESSION_JSON
node photos.mjs BASELINE QUALIFIED_BUILD NEW_PHOTOS_JSON
node sheet.mjs BASELINE QUALIFIED_BUILD RIVALS NEW_SHEETS_JSON
node own-fixtures.mjs BASELINE QUALIFIED_BUILD ROOT/test/selected-mesh-fixture.ts RIVALS NEW_FIXTURES_JSON
```

Keep the committed `fresh-manifest.json`: `freeze-selected-validation.mjs`
records the original pre-evaluation generation and disjointness without loading
a decoder. Regeneration does not make these inputs fresh validation again.

In the integrated 0.3.13 checkout, ROOT, install dependencies, build WASM and
JavaScript, and fetch photographs. NEW_BUILD must not exist. The production
builder obtains baseline source from Git and requires current source to match
the qualified copied prototype exactly. Preserve the archive's qualification
receipts alongside these helpers; they bind the original successful evaluation.

```sh
export QR_EXPECTED_WASM_SHA256=8b75949e2dbf5bf968718a8b776c9a8bb8ad8a5f894c6118686ec95efa8258ad
export QR_EXPECTED_WASM_BYTES=252923
node build-production.cjs ROOT candidate-source NEW_BUILD
node verify-build.mjs ROOT NEW_BUILD QUALIFIED_BUILD NEW_BINDING_JSON
node verify-qualified.mjs ROOT NEW_BUILD RIVALS NEW_1120_JSON 8
node verify-backends.mjs ROOT NEW_BUILD RIVALS regression.json NEW_888_JSON
node verify-photos.mjs ROOT NEW_BUILD NEW_PHOTO_VIEWS_JSON
node verify-sheet.mjs ROOT NEW_BUILD RIVALS NEW_SHEETS_JSON
```

The verifiers compare all declared TS/WASM result fields. Location points are
normalised to public x/y fields because TypeScript may retain internal finder
fields absent from WASM. Earlier full TypeScript results are also compared where
captured. Photo text is hashed in receipts, not published as payload text.
Output paths are exclusive; a failed run can leave an empty reserved file.
Require a successful exit and `passed: true`, and use a new path on retry.

## Timing workload

The paired workload covers 51 cases: routine controls, earlier successful
recoveries, all five new reads and both actual selected-mesh misses. Each case
has 60 alternating measured pairs after at least ten warm-up pairs and 500 ms.
Full stable results and input bytes are checked outside the timed call.
Run two independent processes per backend sequentially, with fresh output paths:

```sh
export QR_RIVALS=RIVALS
git -C ROOT show 0fdcd6262f0cd5ddcd7ec6bfba5d131df01c9a37:wasm/qr.wasm > BASELINE_WASM
node paired.mjs ROOT NEW_BUILD ts > NEW_TS_JSON
node paired.mjs ROOT NEW_BUILD wasm BASELINE_WASM ROOT/dist/qr.wasm > NEW_WASM_JSON
node compare-current.mjs ROOT NEW_BUILD RIVALS > NEW_DIRECT_JSON
```

Keep the expected-WASM environment variables above set for every command.
The baseline binary is pinned to SHA-256
`344c36527203940f149186fc6421d355617b90f26881309422500e474aec6066`.
The direct comparison uses the same three fixed 1280 × 720 RGBA clean, blank
and random-noise frames against ZXing-WASM 3.1.7. See `TIMING.md` for the runner
contract. Actual timing results are recorded separately from accuracy.

## Measured timings

Measurements were made on a working desktop with other applications open. No task-owned QR build, test or benchmark ran concurrently; alternating baseline and candidate calls share the same host conditions.

Two independent paired processes per backend ran sequentially on the Apple M4 Max with native Node 24.21.0. Each covers 51 cases with 60 alternating measured pairs after at least ten warm-up pairs and 500 ms. Assertions and input hashing run outside the timed decoder call.

| Case | WASM 0.3.12 median range | WASM 0.3.13 median range | Median change, fork 1 / 2 | p95 change, fork 1 / 2 |
|---|---:|---:|---:|---:|
| starvation-holdout-42 | 14.42–14.43 ms, miss | 14.46–14.50 ms, read | +0.33% and +0.54% | -0.02 ms and +0.05 ms |
| late-phase-holdout-111 | 47.34–47.36 ms, miss | 47.71–47.76 ms, read | +0.74% and +0.89% | +0.45 ms and +0.42 ms |
| version-peer-holdout-58 | 18.24–18.26 ms, miss | 18.34–18.35 ms, read | +0.43% and +0.61% | +0.20 ms and +0.17 ms |
| header-rediscovery-holdout-46 | 19.21–19.26 ms, miss | 19.30–19.31 ms, read | +0.19% and +0.53% | +0.18 ms and +0.10 ms |
| selected-mesh-holdout-39 | 25.50–25.51 ms, miss | 25.62–25.65 ms, read | +0.45% and +0.57% | +0.11 ms and +0.16 ms |
| boundary-unseen-95 | 89.68–89.71 ms, miss | 89.54–89.85 ms, miss | -0.19% and +0.19% | -0.27 ms and -0.06 ms |
| alternate-grid-holdout-125 | 75.89–76.20 ms, miss | 76.02–76.19 ms, miss | -0.24% and +0.40% | -0.05 ms and +0.19 ms |

WASM: the five measured new reads change by 0.19–0.89% relative to earlier misses; the two actual selected-mesh misses change by -0.24–0.40%. Earlier successful curved cases change by -0.45–0.84%. These subsets are separate; all five accuracy gains are covered by the full qualification. Changes compare the medians within each fork, not the median of paired per-call percentage changes.

WASM clean: median changes +0.03% and +0.36%; p95 changes +0.00 ms and -0.01 ms.

WASM blank: median changes -1.47% and -0.87%; p95 changes -0.02 ms and -0.01 ms.

WASM noise: median changes +0.02% and +0.21%; p95 changes +0.11 ms and +0.08 ms.

| Case | TypeScript 0.3.12 median range | TypeScript 0.3.13 median range | Median change, fork 1 / 2 | p95 change, fork 1 / 2 |
|---|---:|---:|---:|---:|
| starvation-holdout-42 | 34.96–34.98 ms, miss | 35.14–35.30 ms, read | +0.52% and +0.92% | -0.14 ms and +0.23 ms |
| late-phase-holdout-111 | 115.64–116.54 ms, miss | 116.06–117.47 ms, read | +0.80% and +0.37% | +0.52 ms and +5.02 ms |
| version-peer-holdout-58 | 43.63–43.69 ms, miss | 43.74–43.80 ms, read | +0.38% and +0.11% | +0.32 ms and -0.09 ms |
| header-rediscovery-holdout-46 | 46.00–46.46 ms, miss | 45.89–46.21 ms, read | -0.53% and -0.24% | -0.01 ms and +0.37 ms |
| selected-mesh-holdout-39 | 61.65–62.37 ms, miss | 61.80–62.08 ms, read | -0.47% and +0.25% | +0.19 ms and +0.25 ms |
| boundary-unseen-95 | 212.46–212.57 ms, miss | 212.32–213.25 ms, miss | -0.07% and +0.32% | +1.68 ms and -0.29 ms |
| alternate-grid-holdout-125 | 178.80–179.37 ms, miss | 178.42–179.40 ms, miss | +0.34% and -0.53% | -0.22 ms and +0.34 ms |

TypeScript: the five measured new reads change by -0.53–0.92% relative to earlier misses; the two actual selected-mesh misses change by -0.53–0.34%. Earlier successful curved cases change by -0.89–0.93%. These subsets are separate; all five accuracy gains are covered by the full qualification. Changes compare the medians within each fork, not the median of paired per-call percentage changes.

The paired pure-TypeScript clean-frame median rises from 3.785–3.824 ms to
3.968–4.017 ms (3.77–6.15% per fork); blank-frame medians rise from
2.937–2.953 ms to 3.077–3.080 ms (4.32–4.78%). These measured regressions
are part of the accuracy trade-off. Their cause is not established by these
timings; no general TypeScript speed improvement is claimed.

TypeScript clean: median changes +6.15% and +3.77%; p95 changes +0.64 ms and +0.16 ms.

TypeScript blank: median changes +4.78% and +4.32%; p95 changes +0.12 ms and -0.03 ms.

TypeScript noise: median changes -0.07% and +0.06%; p95 changes +0.74 ms and -0.17 ms.

Paired WASM final baseline/candidate linear-memory capacities: 14,483,456/14,483,456 bytes; 14,483,456/14,483,456 bytes. Capacity is not peak live allocation. Unchanged Work counts do not measure the extra strict mesh-grid symbol-validation CPU cost. These samples do not establish a general speed improvement, mobile latency or a worst-case time bound.

| Fixed 1280 × 720 RGBA frame | QR 0.3.13 WASM median | ZXing-WASM 3.1.7 median | QR / ZXing p95 ranges |
|---|---:|---:|---:|
| clean | 1.519–1.545 ms | 1.882–1.892 ms | 1.549–1.638 / 2.006–2.068 ms |
| blank | 1.172–1.181 ms | 2.109–2.120 ms | 1.192–1.197 / 2.149–2.156 ms |
| noise | 20.273–20.419 ms | 7.689–7.749 ms | 20.732–20.820 / 7.862–7.918 ms |

All six timing processes completed successfully. Raw samples, identities and
recomputed statistics are retained in the receipts and `timing-summary.json`.
