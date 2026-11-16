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
experimental snapshots. The Rust/WASM implementation builds on `22f3428` and
adds the exact alignment merge frontier qualified below. Kotlin byte planes,
local cross-check counters and reusable module storage are at `7419507`; the
TypeScript scalar-counter refinement is at `8fd581b`. The seventh candidate
applies the existing strict-format requirement before reading payload modules.
Merge, publication and physical camera acceptance remain pending.

The latest matched run uses the accepted alignment-frontier WASM (median
latency, lower is better):

| Measurement | Our packaged WASM | ZXing-WASM 3.1.7 |
|---|---:|---:|
| Clean 1280×720 RGBA, median ms | 1.630 | 1.897 |
| Blank 1280×720 RGBA, median ms | 1.257 | 2.092 |
| Random noise, median ms | 20.114 | 7.448 |
| Existing photographs, exact text | 179/184 | 171/184 |
| Existing synthetic development set, exact text | 91/96 | 89/96 |
| Synthetic validation regression set, exact text and bytes | 172/192 | 169/192 |
| Ten-frame moving/changing-payload sequence, median total ms | 7.356 | 18.686 |

The current receipts are [library comparisons](benchmarks/2026-11-16-m4/alignment-frontier/frontier-libraries.json),
[tracking sequences](benchmarks/2026-11-16-m4/alignment-frontier/frontier-sessions.json)
and [192-case regression results](benchmarks/2026-11-16-m4/alignment-frontier/frontier-validation.json).
These use the same rival WASM and frame hashes as the earlier seventh-candidate
run. Different-run absolute timings do not measure the frontier's gain: the
paired old/new runs below establish its 1.4–1.8% main-noise improvement.
Earlier `candidate7-*` receipts remain historical evidence.
The final paired negative-frame matrix is retained with the frontier receipts.
Final Chrome page/worker, character-set and tracked-session checks also passed
with the current binary; their receipt is retained with the frontier results.
Earlier full rival negative-frame comparisons remain in the parent M4
directory, bound to their recorded binaries and workloads.
These headline wins use the optional WASM backend: TypeScript alone measured
4.162 ms clean and 54.516 ms noise in the same run.

The sequence uses our new tracked WASM session and independently encoded
synthetic frames. It includes initial acquisition, small movements, a changed
payload, a jump, a blank and reacquisition; it is not physical camera evidence.
The old 96-frame set is now development data. A separate 192-frame synthetic
validation seed and payload prefix were fixed before evaluating the candidate;
the earlier decoder changes raised correct reads from 157 to 172 against ZXing's
169. The frontier preserves all 172. The earlier comparison recorded
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
The fresh held-out corpus remains unevaluated.

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
is frozen but has never been decoded. Both rejected filters failed separate
engineering fixtures before this set was opened. Its generator, expected bytes
and pixel hashes are retained for a future candidate; it is not accuracy evidence.

### Next acceptance targets

| Priority | Work | Evidence required |
|---|---|---|
| 1 | Reduce finder/location work on unsuccessful images | Paired M4 median/p95 wins over ZXing across noise resolutions and patterns, with preserved valid reads and bounded work. Exact optimisations retain ordering; a new detection policy needs an explicit SPEC/vector change and fresh validation. |
| 2 | Continue reducing Kotlin allocations and search cost | Paired JVM comparisons with pinned ZXing Java, allocation counts and independent forks; then Android measurements. |
| 3 | Turn tracked scanning into a measured phone advantage | Real Android/iOS first-read and reacquisition latency, moving payloads, difficult lighting, sustained memory/CPU and energy use. |
| 4 | Broaden independent accuracy evidence | A separately collected, frozen camera corpus, exact text/bytes, false-positive controls and per-image outcomes. Existing development and regression sets are not fresh validation. |
| 5 | Make adoption and claims reproducible | Small documented entry points, package checks, copyable examples and versioned comparison commands/results. |

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
