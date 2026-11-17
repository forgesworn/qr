# Performance and verification

## 0.3.13 selected mesh recovery

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

### Accuracy

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

### Production verification

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


### Measured timings

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

See the [methodology, reproduction commands and receipts](benchmarks/2026-11-17-m4/selected-mesh-recovery/README.md).

## 0.3.12 header rediscovery

After every earlier decoder path fails, try one new orientation and format
hypothesis on an already sampled final refinement grid. During existing
full-size late refinement, inspect the failed grid first in its original
orientation, then transposed. Retain only the first different hypothesis whose
two format copies agree within the existing strict BCH radius of two bits.
This recovery is limited to QR versions 7–40. The slot is never replaced, and
a failed final read does not select another grid. Every earlier success,
including alternate-grid recovery, keeps priority. Ordinary version,
Reed–Solomon and segment validation remain unchanged.

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

See the [methodology, reproduction commands and receipts](benchmarks/2026-11-17-m4/header-rediscovery/README.md).

## 0.3.11 alternate reading of existing grids

After every earlier decoder path fails, strictly validate one retained
orientation and format hypothesis against an already sampled refinement grid.
The geometry, polarity and luminance basis must match exactly. A later matching
late attempt invalidates the slot without replacement. Existing successful
results keep priority, and ordinary version, Reed–Solomon and segment checks
remain mandatory.

| Dataset | QR 0.3.10 | QR 0.3.11 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Earlier 96 curved images | 48/96 | 48/96 | 42/96 |
| Earlier 128 curved images | 108/128 | **109/128** | 106/128 |
| Previous curved holdout | 63/128 | **64/128** | 52/128 |
| Separate curved holdout | 72/128 | 72/128 | 67/128 |
| Previous frozen set | 80/128 | 80/128 | 70/128 |
| Version-peer frozen set | 67/128 | 67/128 | 53/128 |
| New set frozen before evaluation | 62/128 | 62/128 | 57/128 |
| Total curved images | 500/864 | **502/864** | 447/864 |
| Original photographs | 180/184 | 180/184 | 171/184 |
| Related photograph views | 2,872/2,944 | 2,872/2,944 | — |
| Curved sheets | 10/18 | 10/18 | — |

The 128 new images were frozen before prototype evaluation, disjoint in pixels
and payloads from the previous 736. All seven evaluated sets are now regression
data. These synthetic images do not establish universal accuracy or performance
on any particular camera. Photograph transformations are related views; their
independent oracle supplies expected text rather than raw payload bytes.

Both the copied prototype and final packaged TypeScript/WASM preserve complete
earlier results, metadata and input pixels across all 864 curves, 888 regressions,
2,944 photo views and 18 sheets. Candidate and baseline Work counters match on
every functional case. All 64 negative controls are rejected, with no wrong QR
payload observed. An own-encoder regression exactly matches the independent
case-90 pixels and was observed failing on 0.3.10 before passing on the candidate.
Official conformance regeneration preserves all 79 previous entries and adds
one frame. All 507 TypeScript tests with required photographs and 123 Kotlin
tests pass; native Rust default-feature tests and doctests pass too.

There is no new image sampling, finder/map search, alignment probe or secondary
attempt. Bounds remain eight second looks, 720 maps and 11,500,000 alignment
probes. At most two additional strict symbol validations, including possible
Reed–Solomon work, are outside the existing Work counters. One saved final/mesh
pair occupies at most 62,658 module bytes. The conservative combined retained-grid
bound is 219,303 bytes, excluding active refinement buffers, metadata and
allocator capacity. Retention can happen before an earlier path eventually
succeeds; unchanged Work counters do not imply unchanged CPU time.

The packaged WASM is 246,322 bytes, 6,295 bytes larger than 0.3.10, SHA-256
`66b4a41067266e3a5e804de4f09dc6dc3c89c97f9bd29105343d1a249a9aa01f`.
Final source, emitted JavaScript, packaged binary and Rust source identities are
bound in the receipts. All-feature Rust tests and standalone WASM checks pass,
including all 640 conformance counters and 1,541 option comparisons. Browser,
worker, character-set and session/reset checks pass. The 1,000-round allocation
run retains 5,242,880-byte capacity after warm-up; the unfreed-handle control
grows. Its 15-fixture workload and 240-round warm-up differ from 0.3.10 and
measure capacity, not peak live allocation.

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

The five persistent misses are general controls: the earlier diagnostic found
no selected alternate that remained a miss. These runs therefore do not measure
the worst-case added symbol-validation cost.

See the [methodology, reproduction commands and receipts](benchmarks/2026-11-17-m4/alternate-grid-recovery/README.md).

## 0.3.10 conflicting-version recovery

After every earlier decoder path fails, one retained map can receive strict
late refinement when it has an exact version word matching its size, a decoded
contradictory peer at three errors, and two agreeing decoded format copies.
The first qualifying map retains its original luminance basis and orientation.
An earlier ordinary attempt does not exclude it; an earlier late attempt does.
Final format, version, Reed-Solomon and segment validation remain unchanged.

| Dataset | QR 0.3.9 | QR 0.3.10 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Evaluated distortion set | 48/96 | 48/96 | 42/96 |
| Earlier distortion set | 106/128 | **108/128** | 106/128 |
| Previous holdout | 63/128 | 63/128 | 52/128 |
| Earlier separate holdout | 72/128 | 72/128 | 67/128 |
| Previous frozen set | 80/128 | 80/128 | 70/128 |
| New set frozen before policy evaluation | 67/128 | 67/128 | 53/128 |
| Earlier curved sheets | 9/18 | **10/18** | — |
| Original photographs | 180/184 | 180/184 | 171/184 |
| All photo rotations, mirrors and polarities | 2,872/2,944 | 2,872/2,944 | — |

The prototype preserves complete earlier successful results and metadata across
736 curved images, the 888-case regression, 2,944 photo views and 18 sheets.
All 64 negative controls are rejected and no wrong QR payload is observed.
QR leads on all six evaluated distortion sets. These finite synthetic sets do
not establish universal accuracy or performance on any particular camera.
The new 128 inputs were frozen before policy evaluation, with no repeated pixels
or payloads from the earlier 608; they are now regression data. Photo views are
related observations, and their independent oracle supplies text rather than bytes.

The diagnostic covers all 14 remaining ZXing-only distortion misses and 21
successful controls. Hook-off and hook-on runs preserve complete released
results, Work and input pixels. An unattempted-only selector recovers one map;
allowing earlier ordinary refinement recovers two. Both become strict refined
reads with zero corrected codewords, and all four final header words are exact.
One previously had two ordinary attempts and the other had none. This isolates
late geometry refinement from weaker payload validation. The two own-encoder
regressions reproduce the independent pixels exactly, fail on 0.3.9 and pass
with the new recovery. All 77 earlier conformance entries remain identical in
the expanded 79-frame pack. All 506 TypeScript tests with required photographs,
Rust all-feature tests and doctests, and Kotlin tests pass.

The maximum becomes eight second looks and 11,500,000 alignment probes, with
the map cap unchanged at 720. There is one extra candidate/basis record and at
most seven attempt records. Four original retained grids plus one sequential
terminal grid retain at most 156,645 module bytes logically; active buffers and
allocator/GC capacity are additional. Eight optional direct captures add at most
250,632 grey probes, separate from `Work.probed`. Rejected-header classification
adds bounded work during collection until the single slot fills; earlier
successes avoid the new terminal attempt but can pay this classification cost.

The packaged WASM is 240,027 bytes, 2,813 bytes larger than 0.3.9, SHA-256
`27bfa219e20a1daa072d19a0bbad468ce945c76b5a3599972c959d98d37ce614`.

Final packaged WASM matches complete TypeScript results and preserves input
pixels across the 888-case regression, all 736 curved images, 2,944 photo views
and 18 sheets. The standalone 79-frame pack matches all 632 work counters.
Browser, worker, six character-set and session/reset checks pass. A separate
1,000-round allocation check exercises 63 recovery reads across 14 fixtures:
WASM capacity stays at 5,242,880 bytes after warm-up, while the intentionally
unfreed-handle control grows. This workload includes two additional recovery
fixtures compared with 0.3.9, so its capacity is not a matched memory comparison.
Capacity is not peak live allocation. Source, emitted JavaScript and packaged
WASM identities are bound in `production-binding.json`.

Two independent paired processes per backend ran sequentially on the Apple M4 Max with
native Node 24.21.0. Each covers 38 cases with 60 alternating measured pairs after at
least ten warm-up pairs and 500 ms. Assertions and input hashing run outside the timed
decoder call.

| Case | WASM 0.3.9 median range | WASM 0.3.10 median range | Paired change |
|---|---:|---:|---:|
| version-peer-recovered-120 | 51.81–51.94 ms, miss | 62.32–62.44 ms, read | +19.99% and +20.52% |
| version-peer-recovered-122 | 44.04–44.10 ms, miss | 54.13–54.25 ms, read | +22.74% and +23.21% |
| known-version-peer-miss-55 | 30.72–30.76 ms, miss | 36.71–36.96 ms, miss | +19.49% and +20.16% |
| holdout-version-peer-miss-37 | 15.59–15.63 ms, miss | 18.25–18.26 ms, miss | +16.76% and +17.10% |
| fresh-version-peer-miss-45 | 12.43–12.43 ms, miss | 16.06–16.09 ms, miss | +29.45% and +29.22% |
| fresh-version-peer-miss-61 | 21.37–21.45 ms, miss | 25.05–25.07 ms, miss | +16.78% and +17.33% |
| fresh-version-peer-miss-77 | 25.98–26.02 ms, miss | 31.86–31.89 ms, miss | +22.45% and +22.77% |

WASM new reads cost 19.99–23.21% more than their earlier misses; the five qualifying
persistent misses cost 16.76–29.45% more. Main-noise medians change by +0.63% and
+0.06%, clean by +0.45% and -0.70%, and blank by +1.12% and -1.01%. Existing
curved-success median changes range from -1.09% to +0.75%. Clean p95 changes by +0.01 ms
and -0.01 ms. These results do not establish a general speed improvement.

TypeScript new reads cost 20.39–23.77% more than their earlier misses; the five
qualifying persistent misses cost 16.04–26.73% more. Main-noise medians change by +0.20%
and +1.10%, clean by -0.11% and -0.19%, and blank by +4.48% and +4.51%. Existing
curved-success median changes range from -1.02% to +1.62%. Clean p95 changes by +0.33 ms
and +0.42 ms. These results do not establish a general speed improvement.

Both paired WASM runs finish with the same 14,483,456-byte linear-memory capacity for
baseline and candidate. Capacity is not peak live allocation. Raw samples and p95 values
are retained. Desktop measurements do not establish mobile latency or worst-case time
bounds.

| Fixed frame | QR 0.3.10 WASM median | ZXing-WASM 3.1.7 median |
|---|---:|---:|
| Clean QR | 1.513–1.518 ms | 1.849–1.879 ms |
| Blank | 1.169–1.180 ms | 2.086–2.150 ms |
| Random noise, no QR | 20.275–20.352 ms | 7.681–7.703 ms |

These direct timings include each packaged API wrapper on identical fixed 1280×720 RGBA
frames, with two sequential processes and 60 alternating measured pairs. They do not
establish general throughput; ZXing remains faster on this random-noise rejection
workload.

See the [reproduction instructions and per-case evidence](benchmarks/2026-11-17-m4/version-peer-recovery/README.md).

## 0.3.9 ordinary-only curvature refinement

A retained curved map can receive an ordinary second look without ever receiving
the late frozen-anchor alignment pass. After every earlier return path fails,
the decoder now selects the first such retained map, matching its exact matrix,
size, orientation, polarity, header hypothesis and luminance basis. It attempts
one strict late refinement and, if needed, a strict direct mesh read. Candidate
admission and final format, version, Reed-Solomon and segment checks are unchanged.

| Dataset | QR 0.3.8 | QR 0.3.9 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Evaluated distortion set | 48/96 | 48/96 | 42/96 |
| Earlier distortion set | 103/128 | **106/128** | 106/128 |
| Previous holdout | 62/128 | **63/128** | 52/128 |
| Earlier separate holdout | 71/128 | **72/128** | 67/128 |
| New set frozen before policy evaluation | 79/128 | **80/128** | 70/128 |
| Earlier curved sheets | 6/18 | **9/18** | — |
| Original photographs | 180/184 | 180/184 | 171/184 |
| All photo rotations, mirrors and polarities | 2,872/2,944 | 2,872/2,944 | — |

No earlier successful result or metadata changes in these checks, and no wrong
QR payload is observed. The 888-case regression preserves earlier results and
rejects all 64 negative controls. The new 128 inputs were frozen before policy
evaluation, with no repeated pixels or payloads from the earlier 480, and are
now regression data. QR leads on four of these five distortion sets and ties on
one; these finite synthetic sets do not establish a universal accuracy lead or
performance on a particular camera. Photo transformations are related views;
photos independently supply expected text, while synthetic cases also check bytes.

The diagnostic covers all 18 remaining ZXing-only distortion misses and 24
successful controls. Its disabled and enabled forms preserve complete released
results, work counters and input pixels. Five failures qualify for a paired
replay of the same candidate: strict ordinary refinement fails on all five,
while strict late refinement reads all five. The latter finds three extra
alignment nodes in four cases and seven in the fifth; the final refined reads
succeed without needing direct-mesh fallback. The prototype also recovers one
image in the newly frozen set and three earlier curved sheets.

Three own-encoder fixtures fail on 0.3.8 and pass with the new recovery. They
cover mirrored normal and inverted pictures at two and four pixels per module.
They use six attempts; two separate evaluated failures exercise all seven.
The expanded 77-frame conformance pack preserves all 74 earlier entries,
including stages, complete results and work counts. All 498 TypeScript tests,
required photograph tests, Rust tests and Kotlin tests pass.

The change records the phases of at most six earlier attempts and adds at most
one final second look. The maximum is seven attempts and 10,062,500 alignment
probes, with the 720-map limit unchanged. Optional direct captures add at most
219,303 grey probes across all seven attempts, separate from `Work.probed`.
The three terminal grids have sequential lifetimes: logically retained optional
grids remain bounded at 156,645 bytes, plus metadata including six attempt
records. This excludes active refinement buffers and allocator/GC capacity.
Earlier successes avoid the new final attempt but can pay for phase bookkeeping.

The packaged WASM is 237,214 bytes, 2,423 bytes larger than 0.3.8, SHA-256
`a23bf1023029911f699d203f7a66f8a1c1d8241ba9f72b2e7dc0d1eabc51f469`.

Final packaged WASM matches complete TypeScript results and preserves input
pixels across the 888-case regression, 608 curved images, 2,944 photo views and
18 sheets. The standalone pack matches all 616 work counters. Browser, worker,
six character-set and session/reset checks pass. A separate 1,000-round
allocation check exercises 63 recovery reads across 12 fixtures: WASM capacity
stays at 4,325,376 bytes after warm-up, while the intentionally unfreed-handle
control grows. Capacity is not peak live allocation.

Two independent paired processes per backend ran sequentially on the Apple M4
Max with native Node 24.21.0. Each covers 31 cases with 60 alternating measured
pairs after at least ten warm-up pairs and 500 ms. WASM main-noise medians change
by -0.05% and -0.07%, clean by +0.46% and -1.11%, and blank by +0.52% and -0.63%.
Existing curved-success medians vary between -0.46% and +0.54%. These changes
do not establish a general speed improvement.

| Case | WASM 0.3.8 median range | WASM 0.3.9 median range | Paired change |
|---|---:|---:|---:|
| New recovery 73 | 28.50–28.58 ms, miss | 33.67–33.78 ms, read | +18.13%, +18.22% |
| New recovery 79 | 31.46–31.47 ms, miss | 36.59–36.73 ms, read | +16.30%, +16.71% |
| New recovery 88 | 34.44–34.58 ms, miss | 39.52–39.76 ms, read | +14.75%, +15.01% |
| Previous holdout 104 | 48.76–48.93 ms, miss | 57.19–57.60 ms, read | +17.29%, +17.72% |
| Earlier separate holdout 88 | 35.43–35.44 ms, miss | 40.46–40.56 ms, read | +14.20%, +14.43% |
| New frozen set 122 | 61.93–62.26 ms, miss | 70.08–70.72 ms, read | +13.15%, +13.59% |

The six new reads cost 13.15–18.22% more in WASM than their earlier misses;
two qualifying persistent misses cost 13.20–15.73% more. TypeScript new reads
cost 14.04–17.82% more, with those misses costing 12.69–16.17% more. This is an
explicit accuracy/time trade-off. TypeScript main-noise medians change by -0.56%
and -0.96%; clean by -0.43% and +1.96%, and blank by -4.32% and +4.38%.
Existing curved-success medians vary between -0.71% and +1.42%. Despite small
clean-frame median changes, TypeScript clean p95 rises by 0.89 and 1.09 ms in
the two forks; other routine tails are mixed. All raw samples and p95 values
are retained. Both WASM versions finish the paired run at 14,483,456 bytes of
linear-memory capacity. Desktop measurements do not establish mobile latency
or worst-case time bounds.

See the [reproduction instructions and per-case evidence](benchmarks/2026-11-17-m4/ordinary-curvature-refinement/README.md).

## 0.3.8 conflicting-format recovery

A distorted code can have one reliable format header and a conflicting peer
that is only just correctable. Previously, this conflict excluded the map from
curvature recovery. The decoder now retains one such map with exact version
evidence, preferring a zero/one-error header over a two-error header when the
conflicting peer needs three corrections. It attempts that map only after every
earlier path fails. Both final format copies must still agree within two errors;
version, Reed-Solomon and segment checks remain unchanged.

| Dataset | QR 0.3.7 | QR 0.3.8 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Evaluated distortion set | 44/96 | **48/96** | 42/96 |
| Earlier distortion set | 89/128 | **103/128** | 106/128 |
| Previous holdout | 53/128 | **62/128** | 52/128 |
| Separate set frozen before evaluation | 58/128 | **71/128** | 67/128 |
| Earlier curved sheets | 4/18 | **6/18** | — |
| Original photographs | 180/184 | 180/184 | 171/184 |
| All photo rotations, mirrors and polarities | 2,872/2,944 | 2,872/2,944 | — |

No earlier successful result or metadata changes in these checks, and no wrong
QR payload is observed. The 888-case regression preserves earlier results and
rejects all 64 negative controls. Final packaged WASM matches complete TypeScript
results and input preservation across that regression, all 480 curved images,
all 2,944 photo transformations and the 18 sheets. Photos independently supply expected text;
synthetic cases also check exact bytes. Photo transformations are related
observations. The separate 128 inputs were frozen before evaluating this policy
and are now regression data. QR leads on three of these distortion sets; ZXing
still leads on the earlier 128 cases. This does not establish a universal
accuracy advantage or performance on a particular camera.

Four own-encoder regressions fail on 0.3.7 and pass with the new recovery. They
cover strong and weak evidence, preference for a later stronger candidate, and
an inverted image requiring the sixth attempt. All 70 earlier conformance
entries remain identical; TypeScript, Rust and Kotlin pass the expanded
74-frame pack. All 495 TypeScript tests and required photographs pass.

The new slot holds one candidate and its luminance basis; it adds no finder or
map search. The original four attempts and the released fifth attempt retain
their order and success priority. The new final attempt raises the maximum to
six second looks and 8,625,000 alignment probes, with the map limit still 720.
Its optional mesh capture adds at most 31,329 grey probes, each interpolating
four pixels; all six optional captures together add at most 187,974 probes,
separate from `Work.probed`. The two terminal temporary meshes have sequential
lifetimes: at most 156,645 bytes of optional mesh grids are logically retained
together, plus metadata. This excludes active refinement buffers and allocator
or garbage-collector capacity. Earlier successes avoid the terminal attempt,
but can pay the small header-classification and candidate-retention cost.

The packaged WASM grows by 250 bytes to 234,791 bytes, SHA-256
`4c30f08b678cfafde9468c813e6645f153f896b6e266896c6fca8523d5c3251c`.

Two independent paired processes per backend ran sequentially on the Apple M4
Max with native Node 24.21.0. Each alternates execution order over 60 measured
pairs after at least ten warm-up pairs and 500 ms. WASM main-noise medians change
by +0.07% and -0.07%, clean by -1.26% and -0.94%, and blank by -2.26% and -2.04%.
TypeScript main noise changes by -0.03% and +0.02%; clean varies by -3.41% and
+3.54%, and blank by -4.03% and +4.34%. These figures do not establish a general
speed improvement. All 23 cases, raw samples and p95 values are retained.

| Case | WASM 0.3.7 median range | WASM 0.3.8 median range | Change in each paired run |
|---|---:|---:|---:|
| New recovery 6 | 5.90–6.02 ms, miss | 7.18–7.31 ms, read | +21.59%, +21.55% |
| New recovery 32 | 3.36–3.39 ms, miss | 6.09–6.11 ms, read | +79.44%, +81.96% |
| New recovery 42 | 4.72–4.80 ms, miss | 7.83–7.86 ms, read | +63.76%, +65.80% |
| New recovery 72 | 6.43–6.45 ms, miss | 11.74–11.81 ms, read | +83.02%, +82.49% |
| New recovery 76 | 28.67–28.69 ms, miss | 34.15–34.28 ms, read | +19.03%, +19.57% |
| New recovery 125 | 56.37–56.69 ms, miss | 66.64–67.18 ms, read | +18.22%, +18.50% |
| Persistent curved miss | 78.65–78.69 ms, miss | 91.98–92.29 ms, miss | +16.89%, +17.34% |

The six new reads cost 18.2–83.0% more in WASM than their earlier misses; the
persistent curved miss costs 16.9–17.3% more. TypeScript new-read costs rise by
18.0–77.8%, with the persistent miss costing 16.9–17.1% more. This is an explicit
accuracy/time trade-off. Earlier successful curved examples stay within 0.6%
in the paired WASM runs. Both WASM versions finish at 14,483,456 bytes of
linear-memory capacity. These desktop measurements do not establish mobile
latency or worst-case time bounds.

A separate 1,000-round allocation check exercises 63 recovery reads across nine
fixtures. WASM linear-memory capacity remains at 4,325,376 bytes after warm-up;
an intentionally unfreed-handle control grows. The standalone pack matches all
592 work counters, and browser, worker, six character-set and session/reset
checks pass. Capacity is not peak live allocation.

See the [0.3.8 receipts and reproduction commands](benchmarks/2026-11-17-m4/conflicting-format-recovery/README.md).

## 0.3.7 one final curvature retry

Four second looks can exhaust their allowance before a retained curved map gets
an attempt. After every earlier recovery path fails, the decoder now tries one
previously unattempted full-size map with exact version evidence. It preserves
the original attempt order and earlier successful results. Strict format,
version, Reed-Solomon and segment validation still apply; a failed fifth attempt
does not proceed to the rest of the queue.

| Dataset | QR 0.3.6 | QR 0.3.7 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Evaluated distortion set | 37/96 | **44/96** | 42/96 |
| Earlier distortion set | 81/128 | **89/128** | 106/128 |
| Separate set frozen before evaluation | 48/128 | **53/128** | 52/128 |
| Earlier curved sheets | 3/18 | **4/18** | — |
| Original photographs | 180/184 | 180/184 | 171/184 |
| All photo rotations, mirrors and polarities | 2,872/2,944 | 2,872/2,944 | — |

No previous successful result or metadata changes in these checks, and no wrong
QR payload is found. The 888-case regression also retains all earlier results
and rejects all 64 negative controls. Final packaged WASM matches complete
TypeScript results and input preservation across that regression, all 352
curved distortions, all 2,944 photo transformations and the 18 sheets. Photos
independently supply expected text; synthetic cases also check exact bytes.
Photo transformations are related observations. The separate 128-case set was
frozen before policy evaluation and decoder imports; it is now regression data.
ZXing retains a substantial lead on the earlier 128 distortions, so these gains
do not establish a universal accuracy advantage.

Three own-encoder fixtures fail on 0.3.6 and pass with the new recovery, covering
normal, inverted and mirrored images. All 67 earlier conformance entries remain
identical; TypeScript, Rust and Kotlin pass the expanded 70-frame pack. The 482
TypeScript tests, required photos, browser and worker checks also pass.

This deliberately raises the second-look limit to five and the conservative
alignment-probe limit to 7,187,500. The original four attempts and 720-map limit
remain unchanged. Four attempted-candidate records add bounded metadata. The
fifth attempt adds ordinary mesh/timing/edge refinement; an optional separate
mesh capture adds at most 31,329 grey probes, each interpolating four pixels,
and 31,329 module bytes. Combined retained grid storage is at most 156,645 bytes
plus metadata. Capture probes are additional to `Work.probed`, which counts
alignment searches. Earlier successful paths do not pay for the fifth attempt.

Two independent paired processes per backend ran sequentially on the Apple M4
Max with native Node 24.21.0. Each alternates execution order over 60 measured
pairs after at least ten warm-up pairs and 500 ms. WASM clean medians change by
+0.02% and +0.33%, blank by +0.50% and -0.87%, and main 720p noise by -0.42%
and +0.03%. TypeScript main noise changes by -0.22% and -0.14%; its blank
variation is -4.86% and +3.97%. These figures do not establish a general speed
improvement. The smaller 320×240 noise case varies by -1.90% and +3.10% in WASM;
all 17 cases, raw samples and p95 values are retained.

| Case | WASM 0.3.6 median range | WASM 0.3.7 median range | Change in each paired run |
|---|---:|---:|---:|
| Newly recovered distortion 32 | 22.62–22.62 ms, miss | 25.65–25.91 ms, read | +14.56%, +13.39% |
| Newly recovered distortion 74 | 54.19–54.39 ms, miss | 65.48–65.54 ms, read | +20.95%, +20.40% |
| Newly recovered distortion 84 | 63.68–63.95 ms, miss | 77.00–77.20 ms, read | +21.24%, +20.40% |
| Newly recovered mirrored distortion 89 | 35.06–35.54 ms, miss | 40.59–41.51 ms, read | +16.80%, +15.77% |
| Existing success after failed meshes | 16.31–16.49 ms | 16.43–16.57 ms | +0.72%, +0.46% |
| Persistent curved miss | 66.27–66.33 ms | 79.32–80.23 ms | +20.95%, +19.70% |

TypeScript costs for the four new reads rise by 12.86–20.41%; the persistent
miss costs 20.11% and 20.58% more. This is an explicit accuracy/time trade-off.
Earlier successful paths avoid the fifth attempt, but retain the small cost of
recording original attempts when refinement is used. Both WASM versions finish
the timing sequence at 14,483,456 bytes of linear-memory capacity. These desktop
measurements do not establish mobile latency or worst-case time bounds.

A separate 1,000-round allocation check exercises 63 reads spread over five
recovery fixtures. WASM linear-memory capacity remains at 4,325,376 bytes after
warm-up; an intentionally unfreed-handle control grows. The standalone pack also
matches all 560 work counters. Capacity is not peak live allocation. The
packaged WASM grows by 1,875 bytes to 234,541 bytes, SHA-256
`b12344a46090e846737e9e27746b5efbcf29b3d5bfebe94b2efbe66e4e529bd3`.

See the [0.3.7 receipts and reproduction commands](benchmarks/2026-11-17-m4/starved-curvature-recovery/README.md).

## 0.3.6 deferred mesh reading

Timing and edge corrections can displace an alignment mesh that already decodes.
The decoder now retains up to four failed meshes and validates them only after
all earlier paths fail. Two-copy format agreement, version, Reed-Solomon and
segment checks remain mandatory. Earlier successful results, including every
metadata field, keep priority.

| Dataset | QR 0.3.5 | QR 0.3.6 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Evaluated distortion set | 30/96 | **37/96** | 42/96 |
| Separate set frozen before evaluation | 78/128 | **81/128** | 106/128 |
| Earlier curved sheets | 2/18 | **3/18** | — |
| Original photographs | 180/184 | 180/184 | 171/184 |
| All photo rotations, mirrors and polarities | 2,872/2,944 | 2,872/2,944 | — |

No previously correct read is lost and no incorrect QR payload is found in
these sets. The 888-case regression preserves all earlier complete results and
rejects all 64 negative controls. Packaged WASM matches the full TypeScript
results and input preservation across that regression, all 2,944 transformed
photos and the three curved-image sets. Photo oracles independently supply text;
synthetic cases also check bytes. Photo transformations are related observations.
The separate 128-case set was frozen before decoder imports and evaluation; it
is now regression data. ZXing still leads on both distortion sets.

Two new shared conformance fixtures exercise reduced-image coordinates and
inverted polarity. They fail on 0.3.5 and pass with this recovery. All 65 prior
conformance entries remain identical; TypeScript, Rust and Kotlin pass the
expanded 67-frame pack. Browser and worker consumers also pass.

The queue adds at most 125,316 module bytes plus metadata, 125,316 grey probes
(each interpolating four pixels) and four final strict grid reads. It retains
owned grids, not image sampling closures. The existing 720-map, four-second-look
and 5,750,000-alignment-probe limits remain unchanged. `Work.probed` counts
alignment searches and does not include the new sampling work. Capturing a grid
can add cost even when a later existing path succeeds.

Two independent paired processes per backend ran sequentially on the Apple
M4 Max with native Node 24.21.0, alternating execution order over 60 measured
pairs after at least ten warm-up pairs and 500 ms. WASM clean medians change
by +0.06% and -0.59%; blank by -0.09% and -1.19%; main 720p noise by +1.00%
and -0.36%. TypeScript main noise changes by +0.71% and -0.37%, clean by
+1.92% and +0.95%, and blank by -4.33% and +0.14%. This variation does not
establish a general speed improvement.

| Case | WASM 0.3.5 median range | WASM 0.3.6 median range | Change in each paired run |
|---|---:|---:|---:|
| Newly recovered distortion 9 | 7.64–7.71 ms, miss | 7.94–8.01 ms, read | +3.83%, +3.94% |
| Newly recovered distortion 16 | 11.32–11.37 ms, miss | 11.69–11.82 ms, read | +3.96%, +3.26% |
| Newly recovered distortion 87 | 61.49–61.55 ms, miss | 64.04–64.27 ms, read | +4.42%, +4.14% |
| Existing success after failed meshes | 16.09–16.12 ms | 16.33–16.50 ms | +2.59%, +1.29% |
| Persistent curved miss | 64.39–64.46 ms | 66.36–66.86 ms | +3.84%, +2.96% |

TypeScript costs for these new reads rise by 2.64–5.27%; the existing later
success costs 1.96% and 2.94% more, and the persistent miss costs 2.89% and
4.62% more. Accuracy trades some recovery time for additional reads. Full raw
samples and p95 values are retained; these are desktop measurements, not phone
latency or worst-case bounds.

Both WASM versions finish the timing sequence at 14,483,456 bytes of linear
memory capacity. A separate 1,000-round allocation check includes 63 reads of
the new fixtures and stays at 3,866,624 bytes after warm-up; an intentional
unfreed-handle control grows. Capacity is not a peak live allocation measurement.
The packaged module grows by 5,390 bytes to 232,666 bytes, SHA-256
`b5a1cc98846027deba1f42e6889db98a1d22d34e270d847363a369c0432bb36e`.

See the [0.3.6 evidence and reproduction commands](benchmarks/2026-11-16-m4/deferred-mesh-reading/README.md).

## 0.3.5 mesh boundary continuation

Alignment patterns stop short of a QR symbol's edges. Previously the mesh held
their outer offsets constant and treated three synthetic lattice corners as
finder centres. The decoder now fits those corners to the actual finder
positions and continues fully trusted outer cells to the symbol boundary.
Cells containing predicted nodes retain the previous clamp. This changes the
geometry after alignment acquisition, with no additional searches or passes.

| Dataset | QR 0.3.4 | QR 0.3.5 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Curved target: rotations, mirrors and both polarities | 14/16 | **16/16** | — |
| All 184 photos with those 16 transformations | 2,870/2,944 | **2,872/2,944** | — |
| Original photographs | 180/184 | 180/184 | 171/184 |
| Evaluated synthetic curved sheets | 0/18 | **2/18** | — |
| Fresh distortion set, frozen before evaluation | 29/96 | **30/96** | **42/96** |

The two photo gains are related views of one image. The fresh set uses different
versions, scales, curves, orientations and polarities from the evaluated sheets;
it is now a regression set. ZXing remains ahead on it. These results establish
limited improvements, not universal curvature support or superiority.

No previously correct read is lost, no incorrect QR payload is found, and all
64 negative controls remain rejected in the 888-case regression. Correction
counts change on eight previously readable regression cases; one also adds an
optional alignment point. Across transformed photos, 49 previous results change
only their correction count. Payloads and other fields are preserved. Packaged
WASM matches all declared TypeScript result fields across the 888 cases and
2,944 transformed photographs. Photo oracles independently supply text;
synthetic cases also check bytes.

The regenerated conformance pack adds two curved sheets; every prior frame,
stage, result and work count remains unchanged. Boundary fitting adds at most
49 trusted flags and three four-node fits per mesh. The 720-map,
four-second-look and 5,750,000-alignment-probe limits remain unchanged.

Two paired M4 Max/native Node 24.21.0 runs show main-noise WASM medians
changing by +0.13% and +0.41%; clean medians change by +0.13% and +0.61%.
Blank medians vary by +0.67% and -0.06%. TypeScript main-noise medians change
by -0.13% and -0.08%, with clean/blank variation within 1.1%. These small
differences do not establish a general speed improvement.

The newly readable rotated photo succeeds in 21.63–21.73 ms in WASM,
versus the previous 52.15–52.17 ms miss; TypeScript takes 47.19–47.49 ms
versus 111.74–113.38 ms. Both WASM instances finish the measured sequence
with 14,483,456 bytes of linear-memory capacity, which is not a peak live
allocation measurement. The module grows by 3,522 bytes to 227,276 bytes,
SHA-256 `6e749ecc264e41d8a4eecc59552f4b00d445cdea02cf789ce844d3f9384b649e`.

See the [0.3.5 evidence and reproduction commands](benchmarks/2026-11-16-m4/mesh-boundary-continuation/README.md).

## 0.3.4 inverted curved-map recovery

The inverse-luminance fallback now retains qualifying curved maps for a final
retry against the same polarity-specific thresholds. Earlier reads and the
original curved-map queue remain first; no new map searches are added.

| Regression set | QR 0.3.3 | QR 0.3.4 |
|---|---:|---:|
| Curved target: rotations, mirrors and both polarities | 7/16 | **14/16** |
| All 184 photos with those 16 transformations | 2,863/2,944 | **2,870/2,944** |
| Original photos | 180/184 | 180/184 |
| Synthetic curved sheets | 0/18 | 0/18 |

The seven additional reads are related inverted views of one photograph. Its
unmirrored 180-degree view still fails in both polarities. All previous complete
TypeScript results survive; no wrong QR text is found. The original 888-case
regression also preserves its results, including 64 rejected negative controls.
Packaged WASM matches every declared result field on all 888 cases and all
2,944 transformed photographs. Photo oracles independently specify text;
synthetic cases also check bytes. These are evaluated regression sets.

Two paired M4 runs show main-noise WASM medians changing by +0.1% and -0.5%,
with clean/blank variation within 1.3%. TypeScript main noise varies from -0.3%
to +0.9%; clean/blank variation reaches 3.7%. The added correct inverted-photo
read takes 22.58–22.60 ms in WASM versus the previous 12.56–12.76 ms miss, and
50.21–50.31 ms in TypeScript versus 28.34–28.36 ms. This trades extra recovery
time for accuracy; it does not establish a general speed improvement.

The four-second-look, 720-map and 5,750,000-probe limits remain. Two candidate
lists can retain eight map records, and the inverse luminance stays live longer
(one byte per pixel). Both WASM instances end the measured fixture sequence at
14,483,456 bytes of linear-memory capacity; this does not measure peak live
allocations. The packaged module is 223,754 bytes, SHA-256
`e86faa3268415f29e7f531c3092ff14ec7947f4830eab0a5bb4e0606003141b5`.

See the [0.3.4 evidence and reproduction commands](benchmarks/2026-11-16-m4/inverted-curvature-recovery/README.md).

## 0.3.3 curved-map recovery

One deferred alignment retry recovers the dense curved `s2-qrcode-2-high-res-1`
photograph. Its first mesh accepts 22 of 33 lattice nodes; the late sweep
uses frozen accepted neighbours to accept the remaining 11. Admission needs
an exact version word matching the existing map and non-conflicting readable
headers. Final two-copy format agreement, version, Reed-Solomon and segment
checks remain required. Earlier successful paths retain priority.

| Dataset | QR 0.3.2 | QR 0.3.3 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Photographs, exact expected text | 179/184 | **180/184** | 171/184 |
| Synthetic validation | 174/192 | 174/192 | 169/192 |
| Stress positives | 172/224 | 172/224 | 150/224 |
| Earlier synthetic set | 92/96 | 92/96 | 89/96 |
| Previously qualified positives | 69/128 | 69/128 | 55/128 |
| Negative controls, rejected | 64/64 | 64/64 | 64/64 |

All 888 cases preserve earlier QR successes and return no wrong QR payloads.
The photograph oracle supplies expected text, not independent raw payload
bytes; synthetic positives also check exact bytes. The packaged WASM and
TypeScript match complete results on every case. The photo floor is regenerated
at 180, with only this newly recovered photo changing status. The packaged
WASM is 222,089 bytes, SHA-256
`f63d7f09a377f3107cf5c9e0693f546b26585a117e302fa1ec9a53d953c107ba`.

The additional geometry checks are deliberately reported separately: QR reads
seven of 16 rotations, mirrors and polarity variants of the target, versus
none before. Inverted variants remain unread. Both QR versions miss all 18
new synthetic curved-sheet cases. These results establish a specific recovery,
not general curvature coverage or superiority on every image. Evaluated cases
are now regression data.

Two independent paired processes on the Apple M4 Max, native Node 24.21.0,
alternate baseline and candidate order over 60 measured pairs after at least
10 warm-up pairs and 500 ms. Clean and blank WASM medians remain within 0.5%;
main 720p noise rises about 0.2%, and three additional noise fixtures vary from
-0.1% to +0.6%. TypeScript main noise changes by 0.0–0.9%, with the additional
noise fixtures costing 0.5–1.3% more. These are measurements, not guaranteed
bounds or phone results.

The recovered photo costs more because the earlier version stops without a
result: WASM medians rise from 12.07–12.12 ms (miss) to 22.21–22.22 ms (correct
read); TypeScript rises from 27.79–27.82 ms to 49.73–49.96 ms. The map cap remains
720 and the second-look cap remains four. The extra alignment sweep makes the
conservative worst-case probe bound 5,750,000, twice the previous mesh bound.
The actual target uses 781,250 probes and two second looks.

Source identities, full per-case receipts, timing samples and reproduction
commands are in the [0.3.3 evidence](benchmarks/2026-11-16-m4/curvature-recovery/README.md).

## 0.3.2 ranked-overflow recovery

The decoder now screens previously ranked finder triples beyond the first six
only after all earlier searches fail. Agreeing format and version copies admit
a full read; the pass shares the existing 720-map/four-second-look frame caps
and uses at most 30 maps, including header probes. Earlier successful reads
keep their result and work counts. The perspective regression needs three
additional maps and is the 63rd frame in the shared conformance pack.

| Dataset | QR 0.3.0 | QR 0.3.2 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Photographs, correct text | 179/184 | 179/184 | 171/184 |
| Synthetic regression, correct text and bytes | 172/192 | 174/192 | 169/192 |
| Stress positives, correct text and bytes | 171/224 | 172/224 | 150/224 |
| Earlier synthetic set, correct text and bytes | 91/96 | 92/96 | 89/96 |
| Fresh qualification positives, correct text and bytes | 69/128 | 69/128 | 55/128 |
| Stress negative controls, false reads | 0/32 | 0/32 | 0/32 |
| Fresh negative controls, false reads | 0/32 | 0/32 | 0/32 |

No previous success was lost and QR returned no wrong payload in these sets.
The fresh 160-case manifest was frozen before candidate evaluation, after
checking unique pixel hashes. It varies versions, error-correction levels and
image damage, but still shares the independent qrcode encoder and our image
renderer with earlier synthetic sets. It shows no additional accuracy gain
from this patch; all evaluated cases are now regression data. Both readers
still miss the 28 finder-occlusion stress cases. A dense curved real photograph
remains unreadable in 0.3.2; 0.3.3 recovers it as described above. These finite results do not prove universal accuracy
or physical-camera performance.

Two paired M4 Max/native arm64 Node 24.21.0 timing forks compare the packaged
0.3.0 and 0.3.2 WASM modules, alternating order over 60 measured rounds after
at least 20 warm-up rounds and one second of warm-up per case. Clean and blank
medians are broadly unchanged (changes range from -2.6% to +0.7%). Main random
noise costs 3.6–3.9% more; the six additional noise controls cost 0.6–6.1% more.
This is an accuracy trade-off, not a rejection-speed improvement. The previous
TypeScript comparison and its repeat show about 3% more time on main noise.
ZXing remains substantially faster on random noise in the earlier direct
comparison below; do not combine timings from different runs into a new ratio.

Exact inputs, code and binary hashes, per-case outcomes, paired samples and
reproduction commands are in the [0.3.2 evidence](benchmarks/2026-11-16-m4/overflow-recovery/README.md).
The packaged module is 217,706 bytes, SHA-256
`ca263eab7555cf8cc40474f9d05baa1d76a1fa0a154f2106ea3b2d31b5ecb32f`.

## 0.3.0 release qualification

Accuracy is the primary objective. Version-directed recovery now reads the
previously missed blurred version-40 stress image: it uses agreeing format
and version copies, runs only after previous searches fail, and stays within
the existing map and second-look caps. All previous successes are retained.
The official conformance pack adds that image as its 62nd frame; TypeScript,
Kotlin and Rust agree on its result and work counts.

| Measured workload | QR | ZXing-WASM 3.1.7 |
|---|---:|---:|
| Photographs, correct text | 179/184 | 171/184 |
| Synthetic regression, correct text and bytes | 172/192 | 169/192 |
| Stress positives, correct text and bytes | 171/224 | 150/224 |
| Stress negative controls, false reads | 0/32 | 0/32 |
| Clean 720p RGBA, WASM median ms | 1.590 | 2.137 |
| Blank 720p RGBA, WASM median ms | 1.205 | 2.238 |
| Random noise, WASM median ms | 20.569 | 7.941 |
| Ten-frame tracked sequence, median total ms | 7.074 | 19.737 |

These are Apple M4 Max/native arm64 Node 24.21.0 results on the recorded inputs,
not phone latency or a universal ranking. TypeScript alone measured 4.661 ms
clean and 55.485 ms noise in that same direct comparison. QR returned no wrong
payloads in these accuracy sets. Both readers still miss all 28 finder-occlusion
stress cases; ZXing alone reads one remaining version-40 perspective case.
All evaluated corpora are now regression data, not unseen validation.

Two paired old/new WASM runs show main-noise median costs of 0.16–0.47% and
512-square noise costs of 0.59–1.67%. Other changes are small and mixed; clean
medians change by 0.21% and 3.63%. This is an accuracy improvement, not a claimed
speed improvement. The full distributions and exact binary identities remain
in the [release receipts](benchmarks/2026-11-16-m4/release-0.3.0/README.md).
The [failure diagnosis](benchmarks/2026-11-16-m4/version-hint/README.md) explains
why a size retry alone did not work and why strict second-look recovery does.

## M4 improvement programme — earlier qualification

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
experimental snapshots. The Rust/WASM implementation builds on `22f3428` and
adds the exact alignment merge frontier qualified below. Kotlin byte planes,
local cross-check counters and reusable module storage are at `7419507`; the
TypeScript scalar-counter refinement is at `8fd581b`. The seventh candidate
applies the existing strict-format requirement before reading payload modules.
The following paragraphs retain the earlier experimental checkpoints. The
0.3.0 release qualification above supersedes their current-build descriptions.
Physical camera acceptance is separate from these automated measurements.

The Kotlin alignment merge frontier is also qualified on M4 with Java
21.0.11. Two independent paired JVM runs reduce 720p noise time by 1.3–4.6%,
512×512 noise by 5.3–6.4% and 1080p noise by 0.7–1.1%. Clean, blank and
checkerboard medians are effectively unchanged. This adds 80 allocated bytes
per clean decode and 19–39 KB (0.12–0.44%) per noisy decode. One striped-frame
p95 rises from 7.783 to 8.172 ms despite a neutral median; the other fork's
stripe median and p95 improve. All 118 Kotlin tests pass with photographs
required, retaining 179/184 correct reads and no wrong text. These are paired
old/new Kotlin measurements, not a fresh ZXing comparison. See the
[Kotlin receipts and reproduction steps](benchmarks/2026-11-16-m4/kotlin-frontier/README.md).

A fixed-eight-point bound for scored alignment duplicates was also measured
and rejected. Despite 83% fewer point visits on the main noise frame, two paired
M4 runs were 0.9–1.0% slower; smaller noisy frames were 1.1–1.3% slower. All 39
native tests, 89 complete ABI comparisons and 184 photographic comparisons
passed, but correctness and lower operation counts did not yield a speed gain.
The [diagnostic, frozen patch and timings](benchmarks/2026-11-16-m4/scored-blocks/README.md)
are retained; production keeps the original duplicate scan.
Checking the centre finder-ratio term first was rejected before compilation:
all 28 diagnostic comparisons passed, but charging the earlier multiplications
increases modelled noise work by 3.9–4.9%. The
[fixed-order diagnostic](benchmarks/2026-11-16-m4/ratio-order/README.md) is retained;
no alternative permutation or production change is included.
An [uncounted WASM diagnostic](benchmarks/2026-11-16-m4/uncounted/README.md)
was also rejected: the main noise time is unchanged and other noise cases
show only small mixed differences. The package keeps the existing counted
entry point and raw Work ABI; no optional uncounted export is added.
A [packed-transition representation diagnostic](benchmarks/2026-11-16-m4/packed-transitions/README.md)
was closed at screening after all 38 result/Work comparisons and 6,168 edge
oracle cases passed. Logical noise storage falls 93.7%, but repeated transition
extraction adds work and clean storage grows 5.76 times. The source ledger did
not justify a compiled prototype; it is not a measured runtime regression.
The coordinate representation and production module remain unchanged.
A [surrounding-ring shadow gate](benchmarks/2026-11-16-m4/surrounding-ring/README.md)
rejects the original finder triples behind all 341 main-noise sampling attempts,
but also rejects the successful triples for five of 18 readable engineering
cases. All 38 unchanged-path result, finder, Work and input comparisons pass.
The mandatory gate is rejected before compilation or broad screening; these
are candidate-survival counts, not measured latency savings or an actual
filtered decoder's miss count. Production retains its existing finder policy.
An [invariant finder-leg observer](benchmarks/2026-11-16-m4/invariant-legs/README.md)
also passed all 38 equality checks. It found 9,177 repeated pixel reads on main
noise, but the absolute walks are short and the named ray closure accounts for
only 0.1865% of the sampled profile. A rewrite is deferred rather than compiled
for this noise objective; no measured speedup or regression is claimed.

The Rust 1.96.0 compiler qualification used unchanged Rust source before the
budget-guard change. Two paired M4 forks reduced clean-frame time by 10.5–11.0%,
blank-frame time by 9.4–9.8% and gradient time by 10.7–11.1%; noise was effectively
unchanged. That module was 207,168 bytes. [Compiler qualification](benchmarks/2026-11-16-m4/compiler196/README.md)
records its exact identity, small mixed tail results and cross-host build fix.
The compiler's local standard-library paths are canonicalised, and the strict
Linux reproduction gate passed at `726f07d` in
[CI run 43884790867](https://github.com/forgesworn/qr/actions/runs/43884790867).

The subsequent [noise profile](benchmarks/2026-11-16-m4/compiler196/profile/README.md)
placed about 45% of sampled self time in finder processing and 31% in placement
and alignment scoring. An exhausted-budget diagnostic found scans still running
after they could no longer attempt a map. The decoder now stops that ordinary
search immediately, while retaining successful final-map reads, queued second
looks and later size allowance resets. The same guards are present in all
three ports; SPEC and the officially regenerated conformance pack record lower
search-work counts on one frame, with unchanged results and map/recovery counts.

Two paired M4 WASM forks reduce main 720p noise latency by 6.8–7.5%, other 720p noise
by 9.0–12.1%, 512² noise by 3.3–4.4% and 1080p noise by 6.8–7.7%. Every noise p95
improves in both forks; clean, patterned and supplemental bent/damaged medians
show no repeatable regression. The exact packaged module is 207,214 bytes,
46 bytes larger than its baseline. [Budget-guard qualification](benchmarks/2026-11-16-m4/budget-dead/README.md)
retains full timing samples, result comparisons and the deliberate work changes.

The matching Kotlin guards separately reduce 720p noise by 3.9–5.5% and 1080p
noise by 4.6–4.8% across two JVM forks. Checkerboard costs 0.053–0.065 ms more
(0.9–1.0%) and its p95 rises 0.081–0.131 ms; stripe medians are mixed but p95
rises 0.105–0.441 ms. These small pattern costs are retained alongside the
larger noise gains; this is not an across-the-board Kotlin speedup.

The earlier matched run uses the guarded Rust 1.96.0 WASM (median latency, lower is better):

| Measurement | Our packaged WASM | ZXing-WASM 3.1.7 |
|---|---:|---:|
| Clean 1280×720 RGBA, median ms | 1.605 | 2.112 |
| Blank 1280×720 RGBA, median ms | 1.192 | 2.169 |
| Random noise, median ms | 19.975 | 7.872 |
| Existing photographs, exact text | 179/184 | 171/184 |
| Existing synthetic development set, exact text | 91/96 | 89/96 |
| Synthetic validation regression set, exact text and bytes | 172/192 | 169/192 |
| Ten-frame moving/changing-payload sequence, median total ms | 6.844 | 19.203 |

The current receipts are [library comparisons](benchmarks/2026-11-16-m4/budget-dead/budget-dead-libraries.json),
[tracking sequences](benchmarks/2026-11-16-m4/budget-dead/budget-dead-sessions.json)
and [192-case regression results](benchmarks/2026-11-16-m4/budget-dead/budget-dead-validation.json).
These use the same rival WASM and frame hashes as the earlier seventh-candidate
run. Different-run absolute timings do not measure either the compiler's gain
or the frontier's earlier gain: the separate paired runs establish those.
Earlier `candidate7-*` and frontier receipts remain historical evidence.
The latest paired negative-frame matrix is retained with the budget-guard receipts.
Final Chrome page/worker, character-set and tracked-session checks also passed
with the current binary; their receipt is retained with the budget-guard results.
Earlier full rival negative-frame comparisons remain in the parent M4
directory, bound to their recorded binaries and workloads.
These headline wins use the optional WASM backend: TypeScript alone measured
4.538 ms clean and 54.842 ms noise in the same run.

The sequence uses our new tracked WASM session and independently encoded
synthetic frames. It includes initial acquisition, small movements, a changed
payload, a jump, a blank and reacquisition; it is not physical camera evidence.
The old 96-frame set is now development data. A separate 192-frame synthetic
validation seed and payload prefix were fixed before evaluating the candidate;
the earlier decoder changes raised correct reads from 157 to 172 against ZXing's
169. The frontier and budget guards preserve all 172. The earlier comparison recorded
zero wrong results from any of those implementations and no lost baseline
successes. TypeScript and packaged WASM agree on every outcome. It uses fresh
pixels and payloads from the same transformation family, so it is not a new
independent photographic corpus. The receipt is
[`candidate3-validation.json`](benchmarks/2026-11-16-m4/candidate3-validation.json).
The fourth candidate retained every outcome in
[`candidate4-validation.json`](benchmarks/2026-11-16-m4/candidate4-validation.json).
Single-pass accuracy-loop timings are diagnostic, not latency comparisons.

The previously unused [256-case frozen corpus](benchmarks/2026-11-16-m4/fresh256-qualification/README.md)
was then evaluated once against the unchanged accepted build: TypeScript/WASM
read 170/224 positive QR frames correctly versus ZXing's 150/224, an 8.93
percentage-point advantage. Both have zero wrong payloads and no false reads
on all 32 negatives. Ours alone reads 22 frames; ZXing alone reads two version-40
perspective/blur cases; neither reads 52. The largest wins are rotation (28/28
versus 21/28) and finder erosion (18/28 versus 3/28). Both miss all 28 occluded
finder cases. TypeScript/WASM payload outcomes agree on all 256. This is
synthetic evidence from an independent encoder and the existing photograph
renderer, not physical-camera acceptance. No tuning preceded that recorded
evaluation. The later version-directed recovery above uses it as regression
data; it cannot be reused as unseen validation.

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

Historical candidate 3 passed all 452 TypeScript tests with photographs required
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

The seventh candidate (`22f3428`) samples the two format copies in both
orientations before attempting a strict read. If neither orientation satisfies
the existing agreement rule, no payload or second-look candidate can survive.
All other reads retain the original order and post-read checks. Ordinary
full-size reads are unchanged. Differential and regression checks cover
recoverable format damage, mirrored/inverted/scaled reads and queue retention;
no vectors changed. The packaged module is 212,269 bytes, 1,611 bytes larger.

The paired M4 comparison against `d2fa5ee` measured 23.168 to 22.397 ms on noise
(3.3% less time), with clean/blank effectively unchanged. Six other noise cases
in the integrated run improve; see
[`candidate7-paired.json`](benchmarks/2026-11-16-m4/candidate7-paired.json) and
[`candidate7-negative.json`](benchmarks/2026-11-16-m4/candidate7-negative.json).
The headline values above come from a separate rival comparison, so they are
not subtracted from earlier runs to claim the incremental speedup.

A refreshed named-function WASM profile of `d2fa5ee` attributes 25.6% of self
samples to location, 23.6% to finder discovery, 11.3% to cross-checks, 7.6% to
row edges and 7.3% to Reed–Solomon correction. It is diagnostic, with a distinct
binary hash, not a competitive timing result. See
[`candidate6-wasm-profile.json`](benchmarks/2026-11-16-m4/candidate6-wasm-profile.json).

Exact duplicate-search instrumentation did not justify a cache: the main noise
frame made 99 locator calls and 341 maps with no identical locator/map keys.
A second noise seed also had none. Some damaged fixtures repeat maps, but
second-look queue state differs. Raw cross-check walks repeat about 18% of
counted work; their final acceptance depends on tolerance, and complete-key
reuse is negligible. With cross-checks accounting for 11.3% of the profile,
the ideal raw-walk saving is only about 2% of total time before cache overhead.
All 16 instrumented cases preserved full results and work counters. The
[diagnostic summary](benchmarks/2026-11-16-m4/candidate6-duplicate-work.json)
records the experiment; no cache was adopted.

### Alignment-cache follow-up: rejected

Instrumentation found substantial repeated observations across windows for the
same image and exact finder triple. The main 720p noise fixture had 79,009
vertical queries, of which 62,383 repeated; a simulation of a 4,096-slot cache
estimated 51,829 hits after bypassing the first window. These are available-work
estimates, not speedups. Instrumented full results and work counters matched
the unchanged decoder on all cases. See the
[observation summary](benchmarks/2026-11-16-m4/alignment-observations.json).

A Rust prototype retained only complete observed bounds, reconstructed each
window's clipping, and kept the original bounded walk on misses. It allocated
no cache for the first window. Its 38 native tests passed, including exhaustive
short-column windows, partial observations, collisions, ordered alignment
results and work, and size retries. Nevertheless, paired M4 timings rejected it:

| Prototype | Baseline noise median ms | Candidate noise median ms | Decision |
|---|---:|---:|---|
| 4,096 slots, first run | 19.940 | 20.274 | Slower |
| 1,024 slots | 22.344 | 22.746 | Slower |
| 4,096 slots, repeat | 22.366 | 22.647 | Slower |

Clean and blank times were effectively unchanged. Cache lookup/setup cost
outweighed the short pixel walks. The code was removed; the distributed WASM
remains unchanged. The [prototype patch](benchmarks/2026-11-16-m4/rejected-alignment-cache.patch)
applies to the Rust sources at `7d51494`; change VERTICAL_SLOTS from 4096 to
1024 to reproduce the smaller trial. Exact binaries, raw samples and environment
identities are in [first](benchmarks/2026-11-16-m4/alignment4096-paired.json),
[smaller](benchmarks/2026-11-16-m4/alignment1024-paired.json) and
[repeat](benchmarks/2026-11-16-m4/alignment4096-repeat.json) receipts. The runners'
revision identifies unchanged harness/source state; candidate identity is the
recorded binary hash plus this patch, built with pinned Rust 1.94.1.

A separate exact rejection idea also had no measured headroom: when a run scale
is at most one pixel and integer length one fails its tolerance, no positive
integer run can pass. None of the main noise fixture's 393 windows met that
condition, nor did the other diagnostic cases. The gate was not implemented.
See [its diagnostic receipt](benchmarks/2026-11-16-m4/impossible-run-gate.json).

### Kotlin against ZXing Java

The separate JVM comparison uses native aarch64 OpenJDK 21.0.11 on the same M4,
a 512 MiB heap and identical packed greyscale pixels. It is not interchangeable
with RGBA/WASM timing. ZXing Java is pinned to
[3.5.4](https://github.com/zxing/zxing/releases/tag/zxing-3.5.4), using an external
jar with SHA-256 `71de5d89341b5fcf5dd89da7f44e84d825d0e084cdf3ec77c9abe26b0f0ceb13`.
The repository's existing test oracle remains 3.5.3; no dependency was added.

Each case gets at least 200 warm-up pairs and two seconds of warm-up, then
60 measured pairs with alternating order. Every result is validated outside
the timer: exact ASCII text, our payload bytes and ZXing's byte segments.
ZXing uses QRCodeReader, HybridBinarizer, TRY_HARDER and normal then inverted
luminance. ThreadMXBean measures allocation during each decode, separately
from validation. Two independent JVM forks qualify the byte-plane candidate.
Shared-process GC counts and p95 observations do not attribute pauses to one
library independently. Source, harness, jar, workload and environment identities
are retained with raw latency samples.

The pre-strict Kotlin baseline allocated 4,874,112 bytes per clean 720p read,
against ZXing's 178,360 bytes, and took 1.265–1.276 ms against 0.987–1.001 ms.
Noisy 720p reads took 46.078–46.875 ms against 13.451–14.094 ms. These losses
motivated byte-backed luminance: exactly sized packed inputs are borrowed for
the synchronous call, other layouts are compacted, and ARGB/inverse/reduced
planes use bytes. Loads are unsigned; reduction sums stay wide integers with
the same rounding. Public signatures, decoded results and conformance remain
unchanged. The [baseline fork 1](benchmarks/2026-11-16-m4/jvm-baseline-fork1.json),
[baseline fork 2](benchmarks/2026-11-16-m4/jvm-baseline-fork2.json) and
[strict-format intermediate](benchmarks/2026-11-16-m4/jvm-strict.json) remain
available to separate the two optimisations.

The byte-plane candidate (`dbb830f`) produced these two independent fork
results. Allocations are decimal bytes per decode, excluding input creation.

| Workload | Kotlin median ms, fork 1 / 2 | ZXing Java median ms, fork 1 / 2 | Kotlin allocated bytes | ZXing allocated bytes |
|---|---:|---:|---:|---:|
| Clean 720p | 1.080 / 1.079 | 0.999 / 0.986 | 1,187,640 | 178,360 |
| Blank 720p | 0.483 / 0.490 | 1.753 / 1.765 | 230,544 | 1,271,872 |
| Noise 720p | 43.801 / 43.959 | 14.370 / 14.286 | 17,875,176–17,884,608 | 1,277,288 |
| Noise 512×512 | 35.205 / 36.379 | 3.975 / 3.922 | 14,584,080 | 365,088 |
| Noise 1080p | 50.530 / 51.346 | 32.201 / 32.098 | 22,246,888 | 2,865,536 |
| Stripes 720p | 8.077 / 8.145 | 2.553 / 2.564 | 13,547,176 | 1,271,872 |
| Checkerboard 720p | 6.579 / 6.636 | 2.319 / 2.300 | 12,850,872 | 1,271,872 |

Clean allocation fell 75.6%, blank allocation 94.1%, and 720p noise allocation
about 20.4% against the strict-format intermediate. Clean latency is consistently
lower across these forks, but baseline/candidate timings were taken in separate
JVM processes, not an interleaved before/after pair. The rival comparisons within
each fork are paired. No material noise-latency improvement is established for
the byte-plane change alone; search remains the dominant gap. Retaining the
change is justified by its allocation reduction and clean/blank observations.
See [byte fork 1](benchmarks/2026-11-16-m4/jvm-byte-fork1.json) and
[byte fork 2](benchmarks/2026-11-16-m4/jvm-byte-fork2.json), including p95 samples.

Current local verification passes 458 JavaScript tests with required photographs,
33 native Rust tests with all features, and 112 Kotlin tests with required
photographs. The Kotlin suite includes unsigned-byte, alpha, packed/padded/tail
input, input-preservation and independent box-mean checks. The exact packaged
WASM rebuild and packed-package consumer checks pass. Chrome page/worker,
character-set and tracked-session checks pass for the unchanged TypeScript/WASM
revision `22f3428`. Hosted checks for this phase are tracked on PR #4.

A diagnostic JFR run on `e5ffc4f` identified the next allocation sites. Among
samples with a QR frame in the printed five-frame stack, cross-check counter
arrays accounted for about 23% of weighted allocation, row-edge arrays 11%,
and per-map module arrays 10%. This includes warm-up and all seven cases; it
is a sampled attribution, not per-frame allocation totals or a timing result.
The [profile summary](benchmarks/2026-11-16-m4/candidate7-jvm-allocation-profile.json)
records its stack-depth limitation and exact source/runtime identity.

The first follow-up (`7d51494`) reused cross-check counters within finder scans
and module storage within a picture-size search. Direct rival comparisons in
[two](benchmarks/2026-11-16-m4/jvm-scratch-fork1.json)
[forks](benchmarks/2026-11-16-m4/jvm-scratch-fork2.json) showed 720p noise
allocation falling from about 17.88 MB to 12.32 MB. Rival timings also shifted
between runs, so those separate runs do not establish a latency improvement.

A new paired-revision runner loads explicit old/new library jars through
separate class loaders, sharing Kotlin/JDK classes and applying the same
reflection path to both. It verifies each decoder's jar identity, compares
every result field and coordinate outside the timer, checks input hashes,
and retains all timings and allocation samples. Reflection adds a small
symmetric cost, so its absolute timings are not substituted for direct rival
measurements. Each case still has at least 200 warm-up pairs and two seconds
of warm-up, followed by 60 alternating pairs in a 512 MiB JVM. Both libraries
share GC; the comparison does not separately attribute pauses.

The [first](benchmarks/2026-11-16-m4/jvm-scratch-paired1.json) and
[second](benchmarks/2026-11-16-m4/jvm-scratch-paired2.json) paired forks confirmed
large allocation reductions but mostly unchanged 720p noise latency and
2–4% slower stripes/checkerboards. That exposed counter-reset and array-access
costs worth investigating before claiming the change as a latency win.

The accepted refinement (`7419507`) keeps the five cross-check counters in
local integers and retains the per-search module buffer. It preserves loop
order, floating-point operations, early returns and work accounting. The new
public regression alternates symbol sizes, polarity and damaged format reads
to check that scratch storage cannot leak between reads. No vectors changed.

Two paired JVM forks compare the complete change with `e5ffc4f`:

| Workload | Median latency change, fork 1 / 2 | Allocation reduction |
|---|---:|---:|
| Clean 720p | 1.1% slower / 1.0% faster | 0.3% |
| Blank 720p | Unchanged / 1.9% faster | Unchanged |
| Noise 720p | 0.4% / 0.6% faster | 31.2% |
| Noise 512×512 | 1.9% / 5.0% faster | 39.2% |
| Noise 1080p | 0.7% / 2.1% faster | 26.9% |
| Stripes 720p | 5.2% / 6.6% faster | 59.3% |
| Checkerboard 720p | 3.9% / 4.3% faster | 59.0% |

The repeatable benefit is lower allocation and faster pattern rejection;
720p noise latency is essentially unchanged. See the final paired
[first](benchmarks/2026-11-16-m4/jvm-final-paired1.json) and
[second](benchmarks/2026-11-16-m4/jvm-final-paired2.json) forks,
[intermediate scalar comparison](benchmarks/2026-11-16-m4/jvm-scalar-incremental.json)
and [jar/source identities](benchmarks/2026-11-16-m4/jvm-build-identities.json).

Fresh direct comparisons against ZXing Java on that revision give:

| Workload | Kotlin median ms, fork 1 / 2 | ZXing Java median ms, fork 1 / 2 | Kotlin allocated bytes |
|---|---:|---:|---:|
| Clean 720p | 1.033 / 1.034 | 0.957 / 0.951 | 1,183,592 |
| Blank 720p | 0.464 / 0.491 | 1.681 / 1.737 | 230,544 |
| Noise 720p | 41.455 / 42.566 | 12.928 / 14.711 | 12,299,832–12,346,768 |
| Noise 512×512 | 34.057 / 34.166 | 3.606 / 4.018 | 8,860,960 |
| Noise 1080p | 48.618 / 48.849 | 28.992 / 32.839 | 16,257,888 |
| Stripes 720p | 7.562 / 7.842 | 2.226 / 2.720 | 5,515,704 |
| Checkerboard 720p | 6.306 / 6.333 | 1.902 / 2.215 | 5,266,968 |

These [first](benchmarks/2026-11-16-m4/jvm-final-rival1.json) and
[second](benchmarks/2026-11-16-m4/jvm-final-rival2.json) rival forks still show
substantial noise/pattern gaps and higher allocations than ZXing. Differences
between independent forks are not incremental speedups. The unchanged WASM
results above remain the current browser comparison.

To compare revisions, build `:core:jar` at each exact revision and preserve
the jars outside the checkout. Run twice with separate outputs:

```sh
./gradlew :core:compareQrJars --console=plain --no-daemon --max-workers=2 \
  -PqrBaselineJar=/external/path/baseline.jar \
  -PqrCurrentJar=/external/path/current.jar \
  -PqrBenchmarkOutput=/external/path/paired-fork1.json
```

To reproduce, obtain the pinned jar outside the repository, verify its SHA-256,
and run from `kotlin/` twice, with separate output files:

```sh
./gradlew :core:compareZxing --console=plain --no-daemon --max-workers=2 \
  -PqrBenchmarkZxingJar=/external/path/core-3.5.4.jar \
  -PqrBenchmarkOutput=/external/path/jvm-fork1.json
```

### TypeScript scalar cross-checks

The TypeScript fallback (`8fd581b`) now keeps the five cross-check counters in local
variables, preserving Number arithmetic, operation order, early returns and
finally-based work accounting. The removed per-call array follows the Kotlin
optimisation, but its JavaScript benefit is measured independently. Two native
arm64 M4 Node processes compare the baseline at `cbc54db` with the candidate:

| Workload | Baseline median ms, fork 1 / 2 | Candidate median ms, fork 1 / 2 | Change |
|---|---:|---:|---|
| Clean 720p | 3.647 / 3.699 | 3.620 / 3.649 | 0.7–1.4% less time |
| Blank 720p | 2.975 / 2.898 | 2.969 / 2.911 | Essentially unchanged |
| Noise 720p, seed 5 | 47.101 / 47.300 | 47.230 / 47.200 | Essentially unchanged |
| Stripes 720p | 19.618 / 19.226 | 17.005 / 16.511 | 13.3–14.1% less time |
| Checkerboard 720p | 14.466 / 14.326 | 12.967 / 12.845 | 10.3–10.4% less time |
| Gradient 720p | 8.950 / 8.956 | 8.979 / 8.960 | Essentially unchanged |

Six additional noise cases at 512×512, 720p and 1080p take 0.1–2.1% less time.
The change is accepted for its repeatable pattern improvement, not as a solution
to the noise gap. There is no new rival comparison or browser timing claim in
this experiment; WASM and Kotlin are unchanged. See the
[first](benchmarks/2026-11-16-m4/ts-scalar-paired1.json) and
[second](benchmarks/2026-11-16-m4/ts-scalar-paired2.json) receipts for p95, raw
samples, workload/build/harness hashes and machine load.

The [paired runner](scripts/compare-typescript.mjs) loads two distinct canonical
build paths and checks that decoder functions differ. Each frame receives at
least 20 warm-up pairs and one second of warm-up, then 60 alternating pairs.
Full results and input hashes are checked outside the timer. Hashing adds
symmetric untimed memory traffic; these are whole-frame Node measurements.

The integrated production build matches every JavaScript byte in the timed
candidate, SHA-256 `3b43bbf7f6f4ebe260a3b1c2ea1b413e7546401363d3b04e526663b76a8410c5`.
A [differential check](benchmarks/2026-11-16-m4/ts-scalar-equivalence.json)
preserves full results and work across 61 conformance frames, four damaged-finder
regressions and 18 noise/pattern cases. The integrated source passes all 458
JavaScript tests with required photographs, typechecking and packed-package
consumer checks. No vectors changed.

```sh
node scripts/compare-typescript.mjs /path/to/baseline/dist /path/to/candidate/dist --negative
```

### Next algorithm experiments

A conservative shared-bit format envelope was investigated and rejected before
building interval geometry. The diagnostic unions format bits over every map
actually emitted for a size hypothesis, including both corner fallbacks. Bits
that differ are unknown. This is an optimistic bound: a sound pre-search
envelope containing those maps cannot know more bits. The diagnostic still
runs the complete original search and compares full results and work counts.

On the main 720p noise frame, no ordinary hypothesis can be rejected. Two
strict hypotheses could be rejected, but neither performs alignment search:
the potential saving is zero of 984,380 alignment pixels and only two of 341
read maps. On two 640×360 noise cases, potential alignment savings are at most
1.4% and 0.1%, before envelope overhead. All 16 diagnostic cases retain their
full results and work, including the four damaged-finder regressions. This
rules out this shared-bit envelope approach as a useful noise optimisation;
it does not rule out every possible format-based search strategy. See
[the diagnostic receipt](benchmarks/2026-11-16-m4/format-envelope-upper-bound.json).
Reproduce against `cbc54db` with the portable
[builder](benchmarks/2026-11-16-m4/format-envelope-diagnostic/build.cjs)
and [runner](benchmarks/2026-11-16-m4/format-envelope-diagnostic/run.mjs);
both take an explicit checkout path and scratch directory. These tools only
instrument a scratch build and never modify the checkout.

Neighbouring-row finder support showed promising work attribution, but failed
correctness. A diagnostic across 24 cases identified unsupported triples
responsible for 63% of alignment-search area in the main noise frame while
retaining all observed successful finder sightings. The actual prototype
computed support only after existing cross-checks accepted a sighting, kept
finder merging and ranking unchanged, and filtered ranked triples before the
six-triple limit. It retained every complete result across 272 cases, including
179/184 correct photographs and 61 conformance frames.

Nevertheless, an independently constructed version-1 symbol with one-pixel
finder centres still reads `A` in the baseline and fails in the prototype.
Adding recovery for single-pixel vertical centres fixes that example but loses
a second valid symbol with a two-pixel centre. These alter finder structure,
not payload modules. Both filters were rejected. Four permanent public tests
(two centre shapes, two quiet margins) protect TypeScript and packaged WASM.
The result demonstrates why extra finder structure cannot be assumed from the
existing successful horizontal, vertical and diagonal cross-checks.

| Initial filter workload | Baseline median ms | Prototype median ms | Outcome |
|---|---:|---:|---|
| Main 720p noise | 45.159 | 30.277 | 33.0% less time |
| 512×512 noise, seed fe13bc9 | 33.949 | 22.723 | 33.1% less time |
| 720p noise, seed 49ad7e32 | 31.236 | 33.564 | 7.5% more time |
| 1080p noise, seed fe13bc9 | 50.043 | 53.368 | 6.6% more time |

Reduced alignment work frees budgets for later passes, so some workloads do
more finder work and run slower. The repaired filter was not timed after its
second correctness failure. The [portable prototype tools, per-case results,
falsifiers and paired M4 receipt](benchmarks/2026-11-16-m4/region-neighbours/README.md)
record both rejected versions. No detector policy or vectors changed.

An exact lazy row index of interior light-dark-light triples was investigated,
grouped by minimum and maximum run length. Clipped first/last triples kept
their scalar treatment; returned candidates retained original order and exact
comparisons. This targeted repeated horizontal alignment work without requiring
additional finder structure.

The [row-index diagnostic](benchmarks/2026-11-16-m4/alignment-row-index/README.md)
now preserves all 28 observed results and work counts, including four thin-finder
regressions. An independent row oracle covers 89,076 short-row/window cases.
For the main 720p noise frame, 225,732 interior visits cover 36,413 unique
triples when reuse is scoped to each finder triple. Whole-row setup would inspect
390,280 triples and is rejected. After leaving each row's first query scalar,
64-pixel touched chunks inspect 55,544 triples across 3,486 chunks; the first
queries still perform 19,461 interior visits. These counts are cumulative, not
peak storage or timing. Eligible patterns still need ordered processing and
exact checks. The clean frame has no repeated row queries and needs no index.
This justified one bounded compact-mask prototype. It passed 37 Rust tests
and [89 complete public-result comparisons](benchmarks/2026-11-16-m4/alignment-row-index/candidate-equivalence.json),
including unchanged input bytes, but failed the performance gate:

| Workload | Baseline median ms, two forks | Prototype median ms, two forks | Result |
|---|---:|---:|---|
| Clean 720p | 1.536 / 1.538 | 1.531 / 1.540 | Neutral |
| Blank 720p | 1.154 / 1.170 | 1.153 / 1.169 | Neutral |
| Main 720p noise | 19.580 / 20.106 | 20.339 / 20.889 | 3.9% slower in both |
| Other noise, six seed/resolution cases | See receipts | See receipts | All slower, 0.8–3.9% |
| Stripes, checkerboard, gradient | See receipts | See receipts | Within 0.5% |

The [first](benchmarks/2026-11-16-m4/alignment-row-index/paired1.json) and
[second](benchmarks/2026-11-16-m4/alignment-row-index/paired2.json) independent
M4 processes retain every sample, median, p95, workload and build hash. These
compare the same two WASM modules, not ZXing. Setup, storage and query overhead
outweigh the avoided enumeration. The prototype is rejected and no production
decoder changed. Its [patch](benchmarks/2026-11-16-m4/alignment-row-index/prototype.patch)
and [reproduction details](benchmarks/2026-11-16-m4/alignment-row-index/prototype.md)
are retained; there is no follow-up chunk-size tuning.

`scripts/compare-wasm.mjs` now accepts `--negative` to compare two modules on
the same 12 clean/blank/noise/pattern fixtures as the paired TypeScript runner.
It records frame, harness and binary hashes, warms up for at least 20 paired
rounds and one second, then measures 60 alternating pairs. Full-result and
input-mutation checks remain outside timed intervals. A same-binary control
completed all 12 cases, with fixture hashes matching the previous TypeScript
receipts. This validates the runner, not a candidate's performance.

### Exact finder-event caching: rejected

A [diagnostic and three bounded prototypes](benchmarks/2026-11-16-m4/finder-events/README.md)
shared strict/loose finder classification while preserving original candidate
order, successful-callback skips, finder lists and work accounting. On the main
720p noise frame, shared classification reduces modelled divisions from 421,531
to 268,789 and absolute-error calculations from 1,047,289 to 827,437, but adds
threshold comparisons and storage. Operation counts alone do not prove speed.

Two independent M4 Node processes measured each candidate against the same
accepted WASM. Each process used 60 alternating pairs after warm-up; complete
results and unchanged inputs were checked outside the timed decode.

| Variant | Main noise latency | Other six noise cases | Stripes | Checkerboard |
|---|---:|---:|---:|---:|
| Eager event cache | 5.0–5.1% lower | 3.7–8.5% lower | 6.0–6.2% higher | 7.6–7.8% higher |
| Fixed majority density fallback | 3.9% lower | 2.9–6.4% lower | 3.6–4.2% higher | 3.7–4.5% higher |
| Eager with exact equal-run shortcut | 5.3% lower | 3.9–8.7% lower | 4.7–5.4% higher | 5.1–5.2% higher |

Clean, blank and gradient were essentially neutral. All variants passed 89
complete public-result checks; the latter two also preserved all 184 photograph
results, including 179 correct reads, zero lost reads and zero wrong text.
Native Rust tests passed (38, 40 and 39 respectively), including independent row
schedules, Work, inverse polarity and thin-finder regressions. The native compiler
ran as x86_64 on M4; the measured WASM ran in native arm64 Node.

The final shortcut proves five equal positive runs pass the loose predicate and
fail the strict one after the existing total guard, avoiding floating-point
work in that case. It still leaves a repeatable pattern slowdown. All three
variants are rejected and this cache family is closed without further tuning.
Production source, SPEC, vectors and the packaged WASM remain unchanged. These
are comparisons against our own baseline, not new ZXing headline measurements.
At that earlier checkpoint the fresh corpus remained unevaluated; its subsequent frozen-build qualification is recorded above.

### Alignment merge frontier: accepted exact optimisation

The next [bounded diagnostic](benchmarks/2026-11-16-m4/alignment-frontier/README.md)
examines comparisons against historical alignment centres. Because rows advance
monotonically, a centre sufficiently far above the current row cannot match any
later accepted observation. An ordered active-ID list could omit it from merge
searches while preserving the original full vector, earliest match, weighted
updates and final sorting.

All 28 diagnostic cases preserve full results, finder lists and Work. On main
720p noise, merge comparisons fall from 1,157,797 to 184,542 before charging
67,224 retirement tests and 40,723 retained-ID moves. Clean performs eight
original and eight active comparisons, plus eight retirement tests; stripes
and gradient have none. The separate 1,002,625 scored-duplicate comparisons on
main noise are unchanged. These counts justified one prototype; its runtime qualification follows below.

A fresh sample of 150 main-noise decodes profiles the exact pre-frontier
packaged WASM (`33a95f2d…`): `place::locate` accounts for 25.14% of sampled self time, finder scanning
24.57%, cross-checks 12.42%, row edges 7.90%, alignment scoring 6.21% and
Reed-Solomon correction 5.74%. The frontier addresses only part of locate.
Symbols were mapped from a named rebuild only after all non-custom WASM
sections were verified byte-identical; the profile and mapper hashes are
retained. The final implementation keeps original centre storage, earliest-match
order, weighted updates, output sorting and Work; SPEC records the equivalence.
The [final source and receipts](benchmarks/2026-11-16-m4/alignment-frontier/final.md)
passed 37 native Rust tests with all features, 89 complete ABI comparisons,
184 photographic comparisons, all 462 JavaScript tests with required photographs,
and actual packed-package checks. The final WASM is 212,865 bytes, SHA-256
`d41c7e06bd693c51cb4c3f7fbb4df1a79ae6853aa58b2160b1817fb739fc427d`.

| Final paired workload | Baseline median ms, two forks | Final median ms, two forks |
|---|---:|---:|
| Main 720p noise | 19.993 / 20.285 | 19.711 / 19.914 |
| Clean | 1.548 / 1.569 | 1.567 / 1.572 |
| Blank | 1.180 / 1.188 | 1.200 / 1.191 |
| Stripes | 7.474 / 7.507 | 7.486 / 7.524 |
| Checkerboard | 6.232 / 6.222 | 6.229 / 6.228 |
| Gradient | 4.128 / 4.134 | 4.185 / 4.141 |

Main noise improves 1.4–1.8%; five other noise cases improve 0.5–2.4% and the
sixth is neutral (+0.2% / −0.4%). The earlier prototype's stripe slowdown did
not recur: final medians differ by about 0.2%, with p95 changing from
7.716/7.618 to 7.575/7.683 ms. Clean, blank and gradient were 1.2–1.7% slower
in the first fork and within 0.2% in the second. This is a modest scoped noise
improvement, not a claim that every workload accelerates.

A [256-frame synthetic stress set](benchmarks/2026-11-16-m4/fresh-stress-unevaluated/README.md)
was kept unevaluated through the optimisation experiments, then qualified
against the frozen accepted build. Both rejected filters failed separate
engineering fixtures before this set was opened. Its unchanged generator,
expected bytes and pixel hashes now accompany the
[first qualification](benchmarks/2026-11-16-m4/fresh256-qualification/README.md);
the set is now regression evidence.

### Next acceptance targets

| Priority | Work | Evidence required |
|---|---|---|
| 1 | Reduce finder/location work on unsuccessful images | Paired M4 median/p95 wins over ZXing across noise resolutions and patterns, with preserved valid reads and bounded work. Exact optimisations retain ordering; a new detection policy needs an explicit SPEC/vector change and fresh validation. |
| 2 | Continue reducing Kotlin allocations and search cost | Paired JVM comparisons with pinned ZXing Java, allocation counts and independent forks; then Android measurements. |
| 3 | Turn tracked scanning into a measured phone advantage | Real Android/iOS first-read and reacquisition latency, moving payloads, difficult lighting, sustained memory/CPU and energy use. |
| 4 | Broaden independent accuracy evidence | A separately collected, frozen camera corpus, exact text/bytes, false-positive controls and per-image outcomes. Existing development and regression sets are not fresh validation. |
| 5 | Make adoption and claims reproducible | Small documented entry points, package checks, copyable examples and versioned comparison commands/results. |

A [pinned-source comparison of noise rejection](benchmarks/2026-11-16-m4/noise-search-comparison.md)
identifies stronger early finder-shape validation and fewer resolution levels
in the exact ZXing implementation tested. Our main noise still attempts 341
sampling maps. Their individual latency contributions have not been measured. Our first
ring-gate shadow experiment rejects every original main-noise sampling triple
but also rejects five successful engineering-case triples, so it is unsuitable
as a mandatory filter under the current preservation target.

A win on these finite suites is not evidence of superiority on every image or
over every ZXing implementation. Current remaining losses include noisy-frame
latency, Kotlin memory use, TypeScript-only latency and the earlier smooth-gradient
recovery cost. Physical camera and energy measurements remain outstanding.


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
