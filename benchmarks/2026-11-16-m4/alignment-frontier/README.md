# Alignment merge frontier: diagnostic and accepted implementation

Pinned source revision: `598894a6e1d57f603e2971d377500ba3a305d64d`. This directory is self-contained apart from the explicit repository argument, its installed TypeScript compiler and conformance frames. It does not use the removed event or alignment scratch directories. The coordinator built and ran it on M4; all 28 complete results, Work and finder-list comparisons passed. The diagnostic tooling itself does not change production decoding; the separately
qualified and integrated Rust optimisation is described below.

```
node build.cjs /path/to/qr /tmp/frontier-generated
node run.mjs /path/to/qr /tmp/frontier-generated > /tmp/frontier-receipt.jsonl
```

The builder reads the exact Git revision, independently transpiles baseline and instrumented modules to the output directory, and adds assertions around the existing ordered `found.find` and scored-duplicate tests. The runner uses 28 approved noise, pattern, clean, damaged and thin-centre cases, including all four thin-centre regressions; it does not use the fresh held-out corpus. It compares complete result, Work and finder lists, emits source and frame SHA-256 values, and fails on any disagreement. Two fractional-blur cases have historically not decoded at baseline; they remain baseline comparisons rather than claimed successful reads.

For each alignment window, the observer tracks a separate ordered shadow of original IDs and updates. It performs retirement on the first vertically accepted observation of a new row. For `lower = y - ceil(tall)`, only a centre `f` with `f.y < lower && abs(f.y - lower) > moduleSize` is retired; no x-only retirement occurs. The observer checks `cy >= lower` for every accepted observation, verifies every retired entry remains unable to match each later observation, compares the shadow's earliest index to the original find result, and compares all weighted centres and counts exactly. It preserves original x-before-y predicate order. The original history and final sorting stay in control. A centre retired at one row remains unchanged until a first hypothetical later match; the nondecreasing lower bound rules that match out. Within a row, an update toward `cy >= lower` cannot move a retained centre further below the bound, so only one retirement pass is modelled.

The receipt counts vertical queries/rejections, observations, create/merge, full-history and active-length histograms, baseline and shadow x/y comparisons, retired verification checks, once-per-accepted-row maintenance passes, expiration comparisons, retirements, compactions and in-place retained moves. Top-level scored-duplicate x/y/distance tests are counted separately. `comparisonsRemoved` subtracts active membership comparisons from original membership comparisons, before charging maintenance and other costs. The byte estimates model 4 bytes per active ID and 1 byte per history flag; cumulative pushed-ID bytes and peak simultaneous estimates exclude vector capacity, allocation, alignment, observer-only shadow copies and retired-verification bookkeeping. A frontier implementation could choose different metadata; these are explicit accounting assumptions, not measured allocation.

The centre bound comes from the accepted vertical dark run, which contains the queried row. Its integer length `L` passes `abs(L - tall) < 0.6 * tall`, so the conservative upper bound `L < 2 * ceil(tall)` leaves a wide margin. Its centre is no more than half that length above the queried row, giving `cy >= y - ceil(tall)`. The retirement test uses the original subtraction order at this lower bound; monotonicity of subtraction then rules out the original distance predicate for any later centre. Non-finite or nonpositive `tall` cannot produce a passing vertical observation. The observer additionally checks the centre bound on every actual accepted observation; this is diagnostic evidence, not a substitute for boundary tests if an implementation is authorised.

A prior profile attributed 25.6% self time to locate on one baseline/workload; that profile is context, not evidence of speedup from this frontier. This observer intentionally does extra work to verify invariants, so do not use its elapsed time as a benchmark.

SHA-256: `build.cjs` e45ad09b550ad722ec50d564017e3d693f8732c3891c87225c2b2dfe96ad2805; `observer.mjs` 63f12ae6c03131319145d6b1da7a4d96625fceb02f4d9fe2f27fff4749e0094e; `run.mjs` 0479ec0449dbd230223fa890f0ca36b3d7a9e05ddaf9df07502d7b4e5fc10efc. The M4 `receipt.jsonl` SHA-256 is `d5c731f8c248f9c890ea096d35e01825f291451a05b22da51a56d3bbae838491`.

For clarity, active ID storage is potential production overhead. The per-history flag byte is a conservative optional representation and is not required by the ordered-ID frontier. Shadow history copies and retired-entry verification exist only for this diagnostic, not the proposed frontier. `compactionRetainedMoves` models stable in-place removal after the first retired slot; it does not count the observer's actual new-array allocations.

## M4 diagnostic results

| Workload | Original merge comparisons | Active merge comparisons | Retirement tests | Retained-ID moves |
|---|---:|---:|---:|---:|
| Main 720p noise, seed 5 | 1,157,797 | 184,542 | 67,224 | 40,723 |
| 640×360 noise, seed 5 | 1,527,705 | 230,332 | 77,539 | 47,504 |
| 640×360 noise, seed 42 | 2,031,584 | 305,059 | 96,575 | 60,277 |
| Clean | 8 | 8 | 8 | 0 |
| Stripes / gradient | 0 | 0 | 0 | 0 |

Main-noise merge comparisons fall by 84.1% before maintenance. There remain
1,002,625 separate scored-duplicate comparisons, which this proposal does not
change. The maximum active set is 33 IDs, compared with 263 historical centres;
these are maxima, not allocations. No runtime gain follows from these counts.
The savings justified one bounded Rust prototype. The [final readable version](final.md)
is accepted after native, ABI, photo, full-package and paired timing checks.

## Fresh accepted-WASM profile

`accepted-profile.json` samples 150 main-noise decodes on native arm64 Node
24.21.0 on M4 Max, using accepted WASM SHA-256
`33a95f2de8d70d61eeef76b8c23eb251e1f748d15f43fa30e6ff90546f983115`
at evidence head `60cf67a`. This is a diagnostic CPU sample, not competitive
latency or a measurement of the observer. `accepted-mapped-profile.json` adds
symbols only after the mapper verifies every non-custom section of the stripped
and named WASM is byte-identical, in order. The named module SHA-256 is
`c0ad195832fbf874c2689dd57a51870e6919b37b6a9a85f70d033ff0e3308136`.

| Function | Sampled self time |
|---|---:|
| `place::locate` | 25.14% |
| `locate::find_finders` | 24.57% |
| `locate::cross_check` | 12.42% |
| `locate::Edges::row` | 7.90% |
| `place::alignment_score` | 6.21% |
| `symbol::correct` | 5.74% |

The proposed frontier addresses only part of `place::locate`; 25.14% is a broad
stage ceiling, not its predicted gain. Function samples do not distinguish
inlined merging from other work inside that function.

Reproduce the named module from the exact accepted sources using Rust 1.94.1,
`CARGO_INCREMENTAL=0`, the worktree's existing target and
`cargo build --locked --release --features host-text --target wasm32-unknown-unknown -j 1`.
Set `RUSTFLAGS="--remap-path-prefix=<canonical-checkout-root>/=."`; unlike the
packaged build, omit `-C strip=symbols`. Copy that output to a scratch file and
leave `wasm/qr.wasm` unchanged. Sample the packaged module with
`node scripts/profile-decode.mjs 150 <scratch-profile.cpuprofile> wasm/qr.wasm`.
Then run `node map-profile-names.mjs <profile.json> <packaged.wasm> <named.wasm>`.
The mapper fails on a core-section mismatch or a missing name. The receipts
record profile, mapper, named/stripped module and section hashes. Raw CPU samples
and the rebuildable named module are not retained in the repository.

## Accepted implementation

[The final patch and qualification](final.md) preserve all original results and
work. Main noisy-frame latency is 1.4–1.8% lower in two final M4 forks, with five
additional noise cases faster and the sixth neutral. Stripes differ by about
0.2%; small clean/blank/gradient variations are reported explicitly. The WASM
adds 596 bytes. This is a scoped improvement, not overall ZXing superiority.
The measured prototype, readable final source and all receipts remain separate.

## Refreshed pinned-rival comparison

The integrated final asset was compared with external ZXing-WASM 3.1.7 using
the existing rotating-order library/session runners. The rival binary and
clean/blank/noise frame hashes match the earlier seventh-candidate run.
`rivals-package-lock.json` records the disposable external installation; it
adds no repository or runtime dependency. Scripts, options, module hashes,
workload hashes and runtime are recorded in the receipts.

| Workload | Final WASM | ZXing-WASM 3.1.7 |
|---|---:|---:|
| Clean 720p, median ms | 1.630 | 1.897 |
| Blank 720p, median ms | 1.257 | 2.092 |
| Main 720p noise, median ms | 20.114 | 7.448 |
| Ten-frame tracked sequence, median total ms | 7.356 | 18.686 |
| Photographs, correct text | 179/184 | 171/184 |
| Existing 96-case development set, correct text | 91/96 | 89/96 |
| Existing 192-case regression set, exact text and bytes | 172/192 | 169/192 |

Our TypeScript and WASM outputs have zero wrong text in these suites and no
lost prior 192-case regression reads. The photo comparator records one text
mismatch from ZXing; this is a dataset result, not a general false-positive
rate. No fresh 256-case held-out stress frames were decoded. The headline
library/session runners use their existing 25/30 measured rounds and five
warm-up rounds; the isolated old/new gate uses at least 20 pairs and one second of warm-up followed by 60 measured pairs,
as documented separately. Do not infer the frontier's speedup by
subtracting prior-run headline timings. This remains desktop/synthetic evidence,
not physical-camera or energy acceptance.
