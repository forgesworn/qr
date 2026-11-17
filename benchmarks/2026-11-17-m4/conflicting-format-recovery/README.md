# Conflicting-format recovery — M4 evidence

Baseline: QR 0.3.7, commit `268fa8291e7ba47d93bbccf00a828d69e5a80dc5`.
Candidate: QR 0.3.8, bound to source and generated JavaScript hashes in these
receipts. Packaged WASM: 234,791 bytes, SHA-256
`4c30f08b678cfafde9468c813e6645f153f896b6e266896c6fca8523d5c3251c`.
Independent tools are qrcode 1.5.4 and ZXing-WASM 3.1.7, installed only in
benchmark scratch. Neither becomes a dependency of QR.

A map with exact version evidence can have conflicting format copies. This
change retains one candidate when the stronger copy is within zero, one or two
bit errors and the conflicting peer needs three corrections. The first zero/one
candidate takes priority over an earlier two-error candidate; no further
replacement follows. Only existing full-size curvature collection points supply
the slot. Every released success path retains priority. The single final retry
still requires two-copy format agreement within two errors, ordinary version,
Reed-Solomon and segment validation. It adds no map search.

| Dataset | 0.3.7 | 0.3.8 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Evaluated distortions | 44/96 | 48/96 | 42/96 |
| Earlier distortions | 89/128 | 103/128 | 106/128 |
| Previous holdout | 53/128 | 62/128 | 52/128 |
| Separate set frozen before evaluation | 58/128 | 71/128 | 67/128 |
| Earlier curved sheets | 4/18 | 6/18 | Not run here |
| Original photographs | 180/184 | 180/184 | 171/184 |
| All photo transformations | 2,872/2,944 | 2,872/2,944 | Not run here |

No earlier successful result changes, including metadata, and no wrong QR
payload is observed. All 64 negative controls in the 888-case regression remain
rejected. Final packaged WASM matches complete TypeScript results and unchanged
inputs across the 888-case regression, all 480 distortions, 2,944 transformed
photos and 18 sheets. Photos independently supply expected text; synthetic cases also check
exact bytes. Photo transformations are related views. The separate 128 inputs
were frozen before policy evaluation and are now regression data. These sets
do not establish a universal accuracy lead; ZXing still leads on the earlier
128 distortions.

## Investigation and regression coverage

`diagnostic-summary.json` records four source-only observer experiments over
35 remaining ZXing-only misses and 13 successful controls. Every experiment
preserves all 48 complete baseline results, work counters and input hashes.
The initial dual-correctable-version hypothesis admits no candidates. The
narrow zero/one-versus-three format rule recovers 19 cases from 19 replays.
Taking the first zero/one/two-versus-three candidate recovers 20 of 22, but
loses one narrow-rule recovery. Giving the first zero/one candidate priority
recovers 21 of 22, including all 19 narrow-rule successes. Every observed shadow
candidate was unattempted in the released decoder. The prototype uses one slot
and one final attempt, without diagnostic probes or a replay list.

`instrument.py`, `instrument-conflict.py`, `instrument-conflict-two.py` and
`instrument-priority.py` reproduce these experiments against a clean 0.3.7
checkout using `build.cjs` and `run.mjs`. Never time an observer build.
`prototype.py` creates the copied production-shaped policy evaluated before
integration; `build-prototype.cjs` compiles it. `qualification.json` and
`regression.json` bind those pre-integration results. The final `production-*`
receipts bind the released source and WASM bytes. Receipts contain hashes and
outcomes, not photographs or their decoded payloads.

Four own-encoder fixtures independently fail on 0.3.7 and pass with recovery:
strong evidence, weak fallback, preference for a later stronger candidate and
an inverted sixth-attempt read. They extend the shared conformance pack from
70 to 74 frames. All 70 prior entries remain identical, including work counters
and result metadata. TypeScript, Rust and Kotlin pass the expanded pack.

## Reproduce accuracy

Use a release checkout with Git history, Node 24 and the repository dependencies:

```sh
npm ci
npm run build
npm run fetch-photos
scratch=$(mktemp -d)
evidence="$PWD/benchmarks/2026-11-17-m4/conflicting-format-recovery"
npm install --prefix "$scratch/rivals" --ignore-scripts --no-audit --no-fund --save-exact qrcode@1.5.4 zxing-wasm@3.1.7
node "$evidence/build-production.cjs" "$PWD" "$scratch/build"
node "$evidence/regression.mjs" "$PWD" "$scratch/build" "$scratch/rivals" "$scratch/regression.json"
node "$evidence/verify-backends.mjs" "$PWD" "$scratch/build" "$scratch/rivals" "$scratch/regression.json" "$scratch/backends.json"
node "$evidence/verify-qualified.mjs" "$PWD" "$scratch/build" "$scratch/rivals" "$scratch/qualified.json"
node "$evidence/verify-photos.mjs" "$PWD" "$scratch/build" "$scratch/photos.json"
node "$evidence/verify-sheet.mjs" "$scratch/build" "$scratch/rivals" "$scratch/sheet.json" "$PWD"
```

The frozen holdout manifest binds its generator and all input hashes. The three
older generators reproduce their earlier manifests byte for byte. Keep the
desired receipts, then remove only the scratch directory you created.

## Paired timings and resource bounds

Two independent processes per backend run sequentially on the Apple M4 Max,
using native Node 24.21.0. Each alternates baseline/candidate execution order,
warms up for at least ten pairs and 500 ms, then measures 60 pairs per case.
The 23 cases cover clean and blank images, several noise dimensions, curved
photos, earlier recoveries, six newly recovered images and a persistent miss.
No other task build, test or timing job runs alongside these measurements.
`ts-1.json`, `ts-2.json`, `wasm-1.json` and `wasm-2.json` retain all raw samples,
medians and p95 values. See [PERFORMANCE.md](../../../PERFORMANCE.md) for the
measured costs. These desktop checks do not establish mobile latency or a
worst-case time bound.

```sh
git show 268fa8291e7ba47d93bbccf00a828d69e5a80dc5:wasm/qr.wasm > "$scratch/before.wasm"
QR_RIVALS="$scratch/rivals" node "$evidence/paired.mjs" "$PWD" "$scratch/build" wasm "$scratch/before.wasm" "$PWD/wasm/qr.wasm" > "$scratch/timing.json"
```

Use `ts` instead of `wasm` for TypeScript. The maximum is six second looks and
8,625,000 alignment probes; the map limit remains 720. The new slot retains one
candidate and its luminance basis. The two terminal temporary meshes have
sequential lifetimes: logically retained optional mesh grids total at most
156,645 bytes plus metadata, excluding active refinement buffers and allocator
or garbage-collector capacity. The six optional captures add at most 187,974
grey probes, each interpolating four pixels, beyond `Work.probed`. Earlier
successes avoid the new terminal attempt but can pay the header-classification
and candidate-retention cost. Newly successful reads can cost more than their
earlier misses.

The standalone 74-frame WASM pack matches all 592 work counters. A 1,000-round
allocation check exercises 63 recovery reads across nine fixtures; linear-memory
capacity remains at 4,325,376 bytes after warm-up. An intentionally unfreed-handle
control grows. Capacity is not peak live allocation.

`browser.json` records packaged-WASM browser, worker, six character-set and
session/reset checks. The browser and its isolated profile are closed after
the check. The native BarcodeDetector comparison is an additional browser
observation, not the ZXing-WASM accuracy comparison above.
