# Conflicting-version recovery — M4 evidence

Baseline: QR 0.3.9, commit `d6a411ca26f01f9a2b32e7a3e7bcccbbdefc7a63`.
Candidate: QR 0.3.10, bound to source and generated JavaScript hashes in these
receipts. Packaged WASM: 240,027 bytes, SHA-256
`27bfa219e20a1daa072d19a0bbad468ce945c76b5a3599972c959d98d37ce614`.
Independent qrcode 1.5.4 and ZXing-WASM 3.1.7 live only in benchmark scratch;
neither becomes a QR dependency.

The first retained map with one exact matching version word, a decoded
contradictory peer at distance three and agreeing decoded format copies can
receive one strict late pass after every earlier path fails. Ordinary attempts
are allowed; prior late attempts exclude the same semantic map. Final validation
is unchanged. Bounds become eight attempts and 11,500,000 alignment probes;
no finder or map search is added.

`trace.json` tests an unattempted-only selector over 14 ZXing-only misses and
21 successful controls. `trace-late.json` allows earlier ordinary attempts and
recovers two instead of one. Both observers preserve full baseline results,
Work and pixels; replay Work is separate. Final refined-grid header evidence
shows both version and both format copies exact in both successful replays.
Neither selector consults expected payload, version, orientation or ZXing output.
The latter policy was frozen before the new 128-image evaluation.

`qualification.json` covers all 736 curved inputs: the earlier 128 set improves
from 106 to 108 correct reads against ZXing's 106; all other results are preserved.
The fresh set remains 67/128 against ZXing's 53. The 888-case regression rejects
all 64 negative controls, 2,944 photo views retain 2,872 reads, and curved sheets
improve from nine to ten out of 18. Full earlier results and metadata remain
identical. Photos independently supply expected text; synthetic cases also check
bytes. Photo transformations are related views. These evaluated sets are now
regression data and do not prove universal accuracy or mobile performance.

`own-fixtures.json` verifies exact independent-renderer pixels first, then
confirms both own-encoder pictures have identical pixels and fail on 0.3.9 but
pass with five attempts. The official regenerated 79-frame conformance pack
preserves all 77 earlier entries. Required photographs and all 506 TypeScript
tests pass, alongside Rust and Kotlin suites.

Final public TypeScript/WASM parity passes on all four suites. Standalone conformance
compares 632 counters with no differences. Browser, worker, six character-set and
session checks pass. The 1,000-round allocation run has stable 5,242,880-byte capacity
after warm-up across 14 recovery fixtures; this differs from the earlier release
workload and is not a matched memory comparison. See `functional-verification.json` and
`production-binding.json` for source and receipt identities.

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

## Reproduce

Use Node 24 and the pinned Rust compiler. Keep rival dependencies and generated
outputs outside the checkout. The observer/prototype helpers require an exact
clean-source baseline; the following paths are examples:

```sh
repo=$PWD
evidence="$repo/benchmarks/2026-11-17-m4/version-peer-recovery"
scratch=$(mktemp -d)
git worktree add --detach "$scratch/base" v0.3.9
(cd "$scratch/base" && npm ci && npm run build && npm run fetch-photos)
mkdir "$scratch/rivals"
cp "$evidence/rivals-package.json" "$scratch/rivals/package.json"
cp "$evidence/rivals-package-lock.json" "$scratch/rivals/package-lock.json"
(cd "$scratch/rivals" && npm ci --ignore-scripts)
python3 "$evidence/instrument.py" "$scratch/base" "$scratch/observer-source"
node "$evidence/build.cjs" "$scratch/base" "$scratch/observer-source" "$scratch/observer-build"
node "$evidence/run.mjs" "$scratch/base" "$scratch/observer-build" "$scratch/rivals" "$scratch/trace.json"
python3 "$evidence/instrument-late.py" "$scratch/base" "$scratch/late-source"
node "$evidence/build.cjs" "$scratch/base" "$scratch/late-source" "$scratch/late-build"
node "$evidence/run.mjs" "$scratch/base" "$scratch/late-build" "$scratch/rivals" "$scratch/trace-late.json"
python3 "$evidence/prototype.py" "$scratch/base" "$scratch/candidate-source"
node "$evidence/build-candidate.cjs" "$scratch/base" "$scratch/candidate-source" "$scratch/candidate-build"
node "$evidence/qualify.mjs" "$scratch/base" "$scratch/candidate-build" "$scratch/rivals" "$scratch/qualification.json" 8
node "$evidence/regression.mjs" "$scratch/base" "$scratch/candidate-build" "$scratch/rivals" "$scratch/regression.json"
node "$evidence/photos.mjs" "$scratch/base" "$scratch/candidate-build" "$scratch/photos.json"
node "$evidence/sheet.mjs" "$scratch/candidate-build" "$scratch/rivals" "$scratch/sheet.json" "$scratch/base"
node "$evidence/own-fixtures.mjs" "$scratch/base" "$scratch/candidate-build" "$repo/test/version-peer-fixture.ts" "$scratch/rivals" "$scratch/own-fixtures.json"
```

Use the committed fresh manifest; do not replace it with a newly selected set.
`freeze.mjs` records its pre-evaluation generation and disjointness from all 608
previous pixels and payloads, without importing a decoder.

For final packaged checks, run `npm ci` and `npm run fetch-photos` in the current
checkout, then `npm run build:wasm` and `npm run build`. Compile current source
using `build-candidate.cjs "$repo" "$repo/src" NEW_BUILD`, and run
`verify-build.mjs ROOT BUILD PROTOTYPE_BUILD NEW_RECEIPT` to bind source, emitted
JavaScript and WASM bytes. The `verify-*` variants check full public results and
input preservation; `verify-qualified.mjs` takes final argument `8`. Standalone
work-counter comparison is the separate `rust/bench/wasm-pack.mjs` check.

`paired.mjs` takes repository, build directory, `ts` or `wasm`, and old/new WASM
paths. Set `QR_RIVALS` to the isolated rivals directory. Run two sequential
processes per backend; never time the observer build. It measures 38 cases,
60 alternating pairs each, following at least ten warm-up pairs and 500 ms.
The baseline WASM comes from `git show v0.3.9:wasm/qr.wasm`.
`compare-current.mjs ROOT RIVALS` runs the separate packaged-API comparison
against ZXing on three fixed 1280×720 frames, including wrapper costs. Run it
twice sequentially; it verifies both exact binary hashes before measurement.

Keep wanted receipts, remove the clean baseline using `git worktree remove`,
and remove only scratch created for this reproduction. Reuse the checkout's
own Rust `target/`; do not create fresh target directories per check.
