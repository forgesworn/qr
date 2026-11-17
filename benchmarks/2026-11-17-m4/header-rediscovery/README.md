# Header rediscovery

Baseline: QR 0.3.11, commit
`f129243285ce6d2c57819e1aa91b70807bb74741`.
The qualified copied TypeScript prototype is pinned by
`prototype.py` SHA-256
`79f605719b2e62a4d3f664a24a417cdb50d1e1f4b8160d4ac6ab9c65f97d6e36`.
Independent qrcode 1.5.4 and ZXing-WASM 3.1.7 remain external benchmark tools,
not QR runtime or project dependencies.

## Policy and resource limits

After every earlier decoder path fails, try one new orientation and format
hypothesis on an already sampled final refinement grid. During existing
full-size late refinement, inspect the failed grid first in its original
orientation, then transposed. Retain only the first different hypothesis whose
two format copies agree within the existing strict BCH radius of two bits.
This recovery is limited to QR versions 7–40. The slot is never replaced, and
a failed final read does not select another grid. Every earlier success,
including alternate-grid recovery, keeps priority. Ordinary version,
Reed–Solomon and segment validation remain unchanged.

There is no added finder or map search, image sample, alignment probe or
secondary attempt. Bounds remain eight second looks, 720 maps and 11,500,000
alignment probes. Before the slot fills, at most 16 orientation checks inspect
the two existing format copies; a final strict symbol read may add Reed–Solomon
work. These operations are outside the existing Work counters, so equal Work
does not establish equal CPU time. Retention can occur before an earlier path
eventually succeeds.

The new saved grid contains at most 31,329 module bytes. The conservative
combined retained-grid bound is 250,632 bytes, excluding active refinement
buffers, metadata and allocator capacity. Shared ownership can reduce actual
retention when two recovery paths use the same grid; this bound is not a
measurement of peak live heap or WASM linear-memory capacity.

## Verified prototype evidence

| Dataset | QR 0.3.11 | QR 0.3.12 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Earlier 96 curved images | 48/96 | 48/96 | 42/96 |
| Earlier 128 curved images | 109/128 | 109/128 | 106/128 |
| Previous curved holdout | 64/128 | **67/128** | 52/128 |
| Separate curved holdout | 72/128 | **74/128** | 67/128 |
| Previous frozen set | 80/128 | **81/128** | 70/128 |
| Version-peer frozen set | 67/128 | **69/128** | 53/128 |
| Alternate-grid frozen set | 62/128 | **64/128** | 57/128 |
| New set frozen before evaluation | 58/128 | **59/128** | 53/128 |
| Total curved images | 560/992 | **571/992** | 500/992 |
| Original photographs | 180/184 | 180/184 | 171/184 |
| Related photograph views | 2,872/2,944 | 2,872/2,944 | — |
| Curved sheets | 10/18 | 10/18 | — |

The qualified copied TypeScript prototype gains 11 reads: ten among the previous
864 curves and one in the separately frozen 128. Complete earlier successful
results and metadata, Work counters and input pixels are preserved across all
992 curves, the 888-case regression, 2,944 photograph views and 18 sheets. All
64 negative controls are rejected, with no wrong QR payload observed.

The new 128 inputs were frozen before prototype evaluation and are disjoint
in pixels and payloads from the previous 864. Their version dimensions and
transformation families are not claimed to be wholly unseen. They are now
known regression data. Photograph transformations are related views; their
independent oracle supplies expected text rather than raw payload bytes.
Finite synthetic and photographic results do not establish universal accuracy
or performance on a particular camera.

The diagnostic covers 39 successful controls and all 20 remaining ZXing-only
curves. Hooks disabled/enabled preserve complete baseline results, Work and
input pixels on all 59 cases. It selects 13 existing final grids; ten strict
reads recover the expected payload and three still miss. Six recoveries need
zero corrected codewords. A 59-case verifier of the production-shaped copied
prototype reproduces all ten gains and preserves earlier complete results and
Work. Broader 992-case qualification adds `header-rediscovery-holdout-54`.

This establishes causal recovery through a changed header/orientation
hypothesis on the same sampled grid. It does not establish which later check
causes the three remaining misses: no failing-stage classifier was recorded.
The retained version-peer-holdout-87 read has one intact version word and a
contradictory decodable peer; ordinary symbol-version validation is unchanged.
Do not describe every recovery as having two exact version words.

## Final production evidence

The final packaged WASM is 252,519 bytes, 6,197 bytes larger than 0.3.11,
SHA-256 `344c36527203940f149186fc6421d355617b90f26881309422500e474aec6066`.
Source, emitted/distributed JavaScript, compiler and WASM source/binary identities
are bound before decoder loading. The packaged TypeScript and WASM match across
all 992 curves, 888 regressions, 2,944 photo views and 18 sheets, preserving all
earlier successful results, Work counters and input pixels.

All 509 TypeScript tests with required photographs, 123 Kotlin tests and native
Rust default/all-feature tests and doctests pass. Official conformance adds two
frames and preserves all 80 previous entries exactly. Standalone WASM matches
82 frames and 656 counters, 1,643 option comparisons and all 148 encoder vectors;
native/standalone module-grid and rendering comparisons pass. Its 1,000-round
allocation check stays at 5,242,880-byte capacity after warm-up, while the
unfreed-handle control grows. The 17-fixture workload and 272-round warm-up differ
from 0.3.11; this measures capacity, not peak live allocation.

Browser, worker, six character-set cases and session/reset checks also pass.

Measurements were made on a working desktop with other applications open. No task-owned QR build, test or benchmark ran concurrently; alternating baseline and candidate calls share the same host conditions.

Two independent paired processes per backend ran sequentially on the Apple M4 Max with native Node 24.21.0. Each covers 47 cases with 60 alternating measured pairs after at least ten warm-up pairs and 500 ms. Assertions and input hashing run outside the timed decoder call.

| Case | WASM 0.3.11 median range | WASM 0.3.12 median range | Median change, fork 1 / 2 | p95 change, fork 1 / 2 |
|---|---:|---:|---:|---:|
| starvation-holdout-54 | 18.80–18.87 ms, miss | 18.76–18.80 ms, read | -0.21% and -0.34% | -0.00 ms and +0.01 ms |
| admission-holdout-122 | 21.29–21.39 ms, miss | 21.34–21.40 ms, read | +0.21% and +0.03% | +0.18 ms and -0.01 ms |
| late-phase-holdout-6 | 9.32–9.42 ms, miss | 9.33–9.41 ms, read | +0.03% and -0.11% | -0.06 ms and -0.05 ms |
| version-peer-holdout-87 | 28.89–28.91 ms, miss | 28.95–29.00 ms, read | +0.19% and +0.32% | +0.13 ms and +0.13 ms |
| header-rediscovery-holdout-54 | 18.75–18.85 ms, miss | 18.73–18.85 ms, read | -0.00% and -0.14% | +0.00 ms and +0.11 ms |
| boundary-unseen-95 | 89.76–89.80 ms, miss | 89.67–89.78 ms, miss | -0.14% and +0.01% | -0.32 ms and +0.34 ms |
| starvation-holdout-42 | 14.45–14.56 ms, miss | 14.38–14.50 ms, miss | -0.49% and -0.40% | +0.00 ms and -0.03 ms |
| alternate-grid-holdout-125 | 76.38–76.46 ms, miss | 75.93–76.14 ms, miss | -0.58% and -0.42% | -0.61 ms and +0.10 ms |

WASM: the five measured new reads change by -0.34–0.32% relative to earlier misses; the three actual selected-header misses change by -0.58–0.01%. Earlier successful curved cases change by -0.88–1.46%. These subsets are separate; all eleven accuracy gains are covered by the full qualification.

WASM clean: median changes +1.14% and +0.52%; p95 changes -0.01 ms and -0.01 ms.

WASM blank: median changes +0.86% and -0.02%; p95 changes +0.01 ms and -0.01 ms.

WASM noise: median changes -0.06% and -0.03%; p95 changes -0.05 ms and +0.12 ms.

| Case | TypeScript 0.3.11 median range | TypeScript 0.3.12 median range | Median change, fork 1 / 2 | p95 change, fork 1 / 2 |
|---|---:|---:|---:|---:|
| starvation-holdout-54 | 43.56–43.70 ms, miss | 43.75–44.00 ms, read | +0.11% and +1.01% | +0.29 ms and +0.39 ms |
| admission-holdout-122 | 47.47–47.59 ms, miss | 47.89–47.92 ms, read | +0.70% and +0.88% | -0.63 ms and -0.47 ms |
| late-phase-holdout-6 | 23.39–23.48 ms, miss | 23.41–23.49 ms, read | +0.11% and +0.07% | +0.25 ms and +0.12 ms |
| version-peer-holdout-87 | 68.39–68.62 ms, miss | 68.69–69.03 ms, read | +0.43% and +0.60% | +0.92 ms and -0.22 ms |
| header-rediscovery-holdout-54 | 43.32–43.53 ms, miss | 43.63–43.71 ms, read | +0.22% and +0.91% | +0.09 ms and +0.23 ms |
| boundary-unseen-95 | 212.22–212.65 ms, miss | 212.15–212.49 ms, miss | -0.24% and +0.13% | -0.16 ms and +0.03 ms |
| starvation-holdout-42 | 34.66–34.79 ms, miss | 34.80–34.92 ms, miss | +0.42% and +0.37% | +0.22 ms and -0.01 ms |
| alternate-grid-holdout-125 | 178.64–179.60 ms, miss | 179.09–179.88 ms, miss | +0.25% and +0.16% | +1.89 ms and +3.75 ms |

TypeScript: the five measured new reads change by 0.07–1.01% relative to earlier misses; the three actual selected-header misses change by -0.24–0.42%. Earlier successful curved cases change by -0.94–1.13%. These subsets are separate; all eleven accuracy gains are covered by the full qualification.

TypeScript clean: median changes -0.46% and -1.38%; p95 changes +0.39 ms and -0.97 ms.

TypeScript blank: median changes +0.02% and +0.14%; p95 changes +0.52 ms and +0.23 ms.

TypeScript noise: median changes -0.06% and -0.52%; p95 changes +0.51 ms and +0.18 ms.

Paired WASM final baseline/candidate linear-memory capacities: 14,483,456/14,483,456 bytes; 14,483,456/14,483,456 bytes. Capacity is not peak live allocation. Unchanged Work counts do not measure the extra header/symbol-validation CPU cost. These samples do not establish a general speed improvement, mobile latency or a worst-case time bound.

| Fixed 1280 × 720 RGBA frame | QR 0.3.12 WASM median | ZXing-WASM 3.1.7 median | QR / ZXing p95 ranges |
|---|---:|---:|---:|
| clean | 1.521–1.526 ms | 1.889–1.896 ms | 1.557–1.563 / 1.961–2.095 ms |
| blank | 1.167–1.180 ms | 2.118–2.137 ms | 1.186–1.205 / 2.150–2.163 ms |
| noise | 20.265–20.303 ms | 7.703–7.729 ms | 20.516–20.794 / 7.815–7.905 ms |

## Reproduce final production verification

Run builds and measurements sequentially on the same machine. Use Node 24,
the repository's pinned Rust compiler and a JDK. Keep rival packages in scratch.
Create a clean baseline checkout at `f129243285ce6d2c57819e1aa91b70807bb74741`,
run `npm ci`, `npm run build` and `npm run fetch-photos` there, and copy this
folder's helpers and manifests into a scratch helper directory. Install
`rivals-package.json` and `rivals-package-lock.json` there as
`rivals/package.json` and `rivals/package-lock.json` with `npm ci --ignore-scripts`.

From the scratch helper directory, with absolute checkout and rival paths,
recreate the qualified source and original build identity:

```sh
python3 prototype.py BASELINE f129243285ce6d2c57819e1aa91b70807bb74741 candidate-source
node build-candidate.cjs BASELINE candidate-source qualification-build
node qualify.mjs BASELINE qualification-build RIVALS new-qualification.json 8
node regression.mjs BASELINE qualification-build RIVALS new-regression.json
node photos.mjs BASELINE qualification-build new-photos.json
node sheet.mjs BASELINE qualification-build RIVALS new-sheet.json
node own-fixtures.mjs BASELINE qualification-build ROOT/test/header-rediscovery-fixture.ts RIVALS new-own-fixtures.json
```

Keep the committed validation manifest; `freeze-validation.mjs` records the
original pre-evaluation generation and disjointness without importing a decoder.
The evaluated inputs are now regression data.

Build WASM and JavaScript and fetch photographs in the integrated candidate
checkout, ROOT. Use absolute paths for ROOT, BUILD, RIVALS and output files;
BUILD must not exist. The builder retrieves baseline source from Git while
requiring current source to match the qualified prototype exactly. These
production qualification commands passed on the M4:

```sh
node build-production.cjs ROOT ./candidate-source NEW_BUILD
node verify-build.mjs ROOT NEW_BUILD QUALIFIED_PROTOTYPE_BUILD NEW_BINDING_JSON
node verify-qualified.mjs ROOT BUILD RIVALS NEW_992_JSON 8
node verify-backends.mjs ROOT BUILD RIVALS ./regression.json NEW_888_JSON
node verify-photos.mjs ROOT BUILD NEW_PHOTO_TRANSFORMS_JSON
node verify-sheet.mjs ROOT BUILD RIVALS NEW_SHEETS_JSON
```

`QUALIFIED_PROTOTYPE_BUILD` is the original build used for `qualification.json`.
The builder checks copied source with the actual repository TypeScript compiler
options before emission. The identity verifier binds source, every emitted and
distributed module, compiler/configuration, prototype qualification and final
WASM binary/source manifest. Root source may be the integrated candidate rather
than a clean baseline, but it must match the frozen qualified source exactly.

The final verifiers compare all declared TS/WASM result fields. Location points
are normalised to x/y because TypeScript can retain internal finder fields that
are not public WASM fields. Previous TypeScript result objects are also compared
in full where captured. Every frame retains its frozen pixel hash and Work;
new correctness is checked against independently generated expected payloads.
Photo oracle text is hashed in receipts, not published as payload text.

Outputs are exclusive. A failed run can leave an empty reserved output file;
use a new path on retry and require `passed: true` before citing it.

## Timing workload

Run two independent sequential processes for each backend, with no overlapping
compute. The executed runner has 47 cases: routine controls, previous successful
recoveries including the two 0.3.11 alternate-grid gains, five representative new
reads and all three selected-header misses. Full accuracy qualification covers
all eleven gains separately.

```sh
QR_RIVALS=RIVALS node paired.mjs ROOT BUILD ts > NEW_TS_JSON
QR_RIVALS=RIVALS node paired.mjs ROOT BUILD wasm RELEASED_0311_WASM ROOT/dist/qr.wasm > NEW_WASM_JSON
```

The released baseline WASM SHA-256 must be
`66b4a41067266e3a5e804de4f09dc6dc3c89c97f9bd29105343d1a249a9aa01f`.
Each case uses at least ten warm-up pairs and 500 ms, then 60 alternating
measured pairs. Full stable outputs and pixel hashes are checked outside each
timed decode. New reads include straight Q4, mirrored M0, inverted, a
high-correction/version-peer case and the new frozen-set gain. The selected
misses are `boundary-unseen-95`, `starvation-holdout-42` and
`alternate-grid-holdout-125`. They exercise actual selected-header failure cost,
but do not establish a worst-case bound on symbol-validation time.

All six timing processes completed successfully. The raw receipts and
`timing-summary.json` retain identities, samples and recomputed statistics.
`compare-current.mjs ROOT BUILD RIVALS` performs the separate direct ZXing
comparison; run it twice sequentially with fresh output files.
