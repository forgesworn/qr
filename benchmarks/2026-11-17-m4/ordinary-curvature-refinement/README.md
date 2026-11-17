# Ordinary-only curvature refinement — M4 evidence

Baseline: QR 0.3.8, commit `29c18aa8c63df53ced3d08ed4dbd0fa1f876905d`.
Candidate: QR 0.3.9, bound to source and generated JavaScript hashes in these
receipts. Packaged WASM: 237,214 bytes, SHA-256
`a23bf1023029911f699d203f7a66f8a1c1d8241ba9f72b2e7dc0d1eabc51f469`.
Independent tools are qrcode 1.5.4 and ZXing-WASM 3.1.7, installed only in
benchmark scratch. Neither becomes a QR dependency.

One retained curved map which received ordinary but never late refinement gets
a strict late attempt after all earlier decoder paths fail. Selection follows
the original-then-inverse queue order and exact map/basis/header identity.
No new map search or admission relaxation is introduced. Earlier complete
successful results keep priority. The maximum becomes seven attempts and
10,062,500 alignment probes, with the 720-map limit unchanged.

| Dataset | 0.3.8 | 0.3.9 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Evaluated distortions | 48/96 | 48/96 | 42/96 |
| Earlier distortions | 103/128 | 106/128 | 106/128 |
| Previous holdout | 62/128 | 63/128 | 52/128 |
| Earlier separate holdout | 71/128 | 72/128 | 67/128 |
| Newly frozen set | 79/128 | 80/128 | 70/128 |
| Earlier curved sheets | 6/18 | 9/18 | Not run here |
| Original photographs | 180/184 | 180/184 | 171/184 |
| All photo transformations | 2,872/2,944 | 2,872/2,944 | Not run here |

The new 128 inputs were frozen before policy evaluation and are disjoint from
the earlier 480 in pixels and payloads. They are now regression data. QR leads
on four distortion sets and ties on one; this does not establish a universal
accuracy lead. No earlier successful result changes, including metadata, and
no wrong QR payload is observed. Photos independently supply expected text;
synthetic cases also check exact bytes. Photo transformations are related views.

## Diagnosis and regression evidence

`trace.json` records the instrumented 0.3.8 execution over all 18 remaining
ZXing-only misses and 24 successful controls. Both hook-off and hook-on runs
preserve complete results, work counters and pixels. After full failure,
the first retained ordinary-only map is replayed once with each refinement
phase. All five strict ordinary controls miss; all five strict late reads
succeed at the final refined stage. Four cases gain three alignment nodes
(19 to 22); one gains seven (26 to 33). The selection never consults expected
payloads, version, orientation or ZXing output.

`instrument.py`, `build.cjs` and `run.mjs` reproduce that diagnostic. Never
time its observer build. `prototype.py` creates the copied production-shaped
source; `build-candidate.cjs` compiles both it and the pinned released baseline.
`qualification.json`, `regression.json`, `photos.json` and `sheet.json` record
the prototype checks. Final `production-*` receipts verify packaged WASM as
well as complete TypeScript output and input preservation.

Three own-encoder fixtures fail on 0.3.8 and pass with six attempts. They cover
normal/inverted mirrored pictures at two and four pixels per module. Two
separate distortion misses, `admission-holdout-4` and `admission-holdout-89`,
exercise the seven-attempt bound. All 74 earlier conformance entries remain
identical in the 77-frame pack. Required photographs and all 498 TypeScript tests pass,
alongside the Rust and Kotlin suites.

Final packaged WASM matches complete TypeScript results and preserves input
pixels across the 888-case regression, 608 curved images, 2,944 photo views and
18 sheets. The standalone pack matches all 616 work counters. Browser, worker,
six character-set and session/reset checks pass. A separate 1,000-round
allocation check exercises 63 recovery reads across 12 fixtures: WASM capacity
stays at 4,325,376 bytes after warm-up, while the intentionally unfreed-handle
control grows. Capacity is not peak live allocation.

The six newly recovered curved images cost 13–18% more in WASM than the old
failed reads, while two persistent misses cost 13–16% more. Routine WASM medians
are essentially unchanged in the paired runs. TypeScript clean-frame p95 rises
by 0.89–1.09 ms despite small median changes; these measurements do not establish
a general speed improvement.

`functional-verification.json` records source/binary hashes and the final checks.
`ts-1.json`, `ts-2.json`, `wasm-1.json` and `wasm-2.json` contain all 31 paired
cases. `direct-1.json` and `direct-2.json` compare the current packaged APIs on
three fixed 1280×720 frames; they include wrapper costs, not only decoder kernels.
`browser.json` reports the baseline checkout HEAD because the candidate was
uncommitted during the run; its WASM hash identifies the tested candidate.

## Reproduce

Use Node 24 and a clean checkout of the release. A separate baseline checkout
is needed only for the observer/prototype helpers, which deliberately reject
changed 0.3.8 sources. Keep all rival packages and generated output outside
the QR checkout. The following paths are examples:

```sh
repo=$PWD
evidence="$repo/benchmarks/2026-11-17-m4/ordinary-curvature-refinement"
scratch=$(mktemp -d)
git worktree add --detach "$scratch/base" v0.3.8
(cd "$scratch/base" && npm ci && npm run build && npm run fetch-photos)
mkdir "$scratch/rivals"
cp "$evidence/rivals-package.json" "$scratch/rivals/package.json"
cp "$evidence/rivals-package-lock.json" "$scratch/rivals/package-lock.json"
(cd "$scratch/rivals" && npm ci --ignore-scripts)
python3 "$evidence/instrument.py" "$scratch/base" "$scratch/observer-source"
node "$evidence/build.cjs" "$scratch/base" "$scratch/observer-source" "$scratch/observer-build"
node "$evidence/run.mjs" "$scratch/base" "$scratch/observer-build" "$scratch/rivals" "$scratch/trace.json"
python3 "$evidence/prototype.py" "$scratch/base" "$scratch/candidate-source"
node "$evidence/build-candidate.cjs" "$scratch/base" "$scratch/candidate-source" "$scratch/candidate-build"
node "$evidence/qualify.mjs" "$scratch/base" "$scratch/candidate-build" "$scratch/rivals" "$scratch/qualification.json" 7
node "$evidence/regression.mjs" "$scratch/base" "$scratch/candidate-build" "$scratch/rivals" "$scratch/regression.json"
node "$evidence/photos.mjs" "$scratch/base" "$scratch/candidate-build" "$scratch/photos.json"
node "$evidence/sheet.mjs" "$scratch/candidate-build" "$scratch/rivals" "$scratch/sheet.json" "$scratch/base"
```

The committed fresh manifest supplies the frozen pixels and metadata; do not
replace it with a newly selected corpus. `freeze.mjs` documents its generation
and disjointness checks, without importing a decoder.

For final packaged checks, run `npm ci` and `npm run fetch-photos` in the current
checkout. Build with the pinned Rust compiler using `npm run build:wasm`, then
`npm run build`. Use a new build output
directory with `build-candidate.cjs "$repo" "$repo/src" ...`. Run the
`verify-*` variants against that directory and the prototype regression receipt;
`verify-qualified.mjs` also takes the final argument `7`. They check complete
results and input preservation, not only successful text.

`paired.mjs` accepts repository, build directory, `ts` or `wasm`, and old/new
WASM paths. Set `QR_RIVALS` to the isolated rivals directory. Run it in separate
processes twice per backend, sequentially on an idle machine. It uses 60
alternating measured pairs after at least ten warm-up pairs and 500 ms; the
receipts retain raw samples, medians and p95 values for every case. The baseline
WASM comes from `git show v0.3.8:wasm/qr.wasm`.

Keep wanted receipts, then remove the clean baseline with `git worktree remove`
and delete only the scratch created for this reproduction. Reuse the checkout's
own Rust `target/`; do not create a fresh target directory per check.

For the direct current-version comparison, run twice sequentially:

```sh
node "$evidence/compare-current.mjs" "$repo" "$scratch/rivals" > "$scratch/direct-1.json"
node "$evidence/compare-current.mjs" "$repo" "$scratch/rivals" > "$scratch/direct-2.json"
```

The script verifies exact QR and rival binary hashes before measuring. It checks
payloads, complete per-reader result stability and unchanged pixels outside
the timed calls. Blank and noise frames contain no QR code.
