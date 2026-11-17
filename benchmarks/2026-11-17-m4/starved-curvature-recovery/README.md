# One final curvature retry — M4 evidence

Baseline: QR 0.3.6, commit `f090e489422507f57e30f50b6c8d5f6efdc4993a`.
Candidate: QR 0.3.7, identified by the source and generated JavaScript hashes in
these receipts. The packaged WASM is 234,541 bytes, SHA-256
`b12344a46090e846737e9e27746b5efbcf29b3d5bfebe94b2efbe66e4e529bd3`.
Independent tools are qrcode 1.5.4 and ZXing-WASM 3.1.7, installed only in
benchmark scratch. Neither becomes a dependency of QR.

The original four second looks can exhaust their allowance on the wrong maps.
After all earlier recovery paths fail, one retained exact-version curved map
that has not already been attempted at full size may receive a final strict
second look and mesh read. Original luminance precedes inverse luminance; the
first eligible candidate is the only one attempted. Previous successful results
retain priority. The format, version, Reed-Solomon and segment checks remain.

| Dataset | 0.3.6 | 0.3.7 | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Original photographs | 180/184 | 180/184 | 171/184 |
| All photo transformations | 2,872/2,944 | 2,872/2,944 | Not run here |
| Earlier curved sheets | 3/18 | 4/18 | Not run here |
| Evaluated distortions | 37/96 | 44/96 | 42/96 |
| Earlier distortions | 81/128 | 89/128 | 106/128 |
| Separate set frozen before evaluation | 48/128 | 53/128 | 52/128 |

No previous successful result changes, including metadata, and no wrong QR
payload is observed. All 64 negative controls in the 888-case regression remain
rejected. The packaged WASM matches complete TypeScript results and input
preservation across that regression, the 352 distorted images, all 2,944 photo
transformations and the 18 sheets. Photos independently supply expected text;
synthetic cases also check exact bytes. Photo transformations are related views.
The separate 128 inputs were frozen before policy evaluation and decoder imports;
they are now evaluated regression data. These sets do not establish a universal
lead: ZXing retains a substantial advantage on the earlier 128 distortions.

`diagnostic-summary.json` records the source-only observer investigation of 36
remaining ZXing-only reads and seven controls. All 43 complete results, work
counters and input hashes match the baseline. Of 21 eligible one-candidate
replays, 13 recover a correct payload. The observer performs extra probes and
must never be timed. `instrument.py`, `build.cjs` and `run.mjs` reproduce it
against a clean 0.3.6 checkout with its dependencies installed. `prototype.py`
records the policy evaluated before production integration. The three new
shared fixtures were independently observed to fail on 0.3.6, then pass in
TypeScript, Rust and Kotlin. All 67 previous conformance entries remain identical.

## Reproduce accuracy

Use a release checkout with Git history, Node 24 and the repository dependencies:

```sh
npm ci
npm run build
npm run fetch-photos
scratch=$(mktemp -d)
evidence="$PWD/benchmarks/2026-11-17-m4/starved-curvature-recovery"
npm install --prefix "$scratch/rivals" --ignore-scripts --no-audit --no-fund --save-exact qrcode@1.5.4 zxing-wasm@3.1.7
node "$evidence/build-production.cjs" "$PWD" "$scratch/build"
node "$evidence/regression.mjs" "$PWD" "$scratch/build" "$scratch/rivals" "$scratch/regression.json"
node "$evidence/verify-backends.mjs" "$PWD" "$scratch/build" "$scratch/rivals" "$scratch/regression.json" "$scratch/backends.json"
node "$evidence/verify-qualified.mjs" "$PWD" "$scratch/build" "$scratch/rivals" "$scratch/qualified.json"
node "$evidence/verify-photos.mjs" "$PWD" "$scratch/build" "$scratch/photos.json"
node "$evidence/verify-sheet.mjs" "$scratch/build" "$scratch/rivals" "$scratch/sheet.json" "$PWD"
```

The frozen manifest binds the separate set's generator and all input hashes.
`frames96.mjs` and `frames128.mjs` reproduce the earlier manifests byte for byte.
`regression.json` is the pre-integration qualification receipt;
`production-backends.json` checks that final packaged output against it.
The other `production-*.json` receipts bind final source and WASM identities.
Receipts contain hashes and outcomes, not photographs or their decoded payloads.
Keep the desired results, then remove only the scratch directory you created.

## Paired timings and bounds

Two independent processes per backend run sequentially on the Apple M4 Max with
native Node 24.21.0. Each uses alternating baseline/candidate order, at least ten
warm-up pairs and 500 ms, followed by 60 measured pairs per case. No other task
build, test or timing job runs alongside them. `ts-1.json`, `ts-2.json`,
`wasm-1.json` and `wasm-2.json` retain all samples, medians and p95 values.
The 17 cases include ordinary images, several noise dimensions, transformed
curved photos, four newly recovered distortions, earlier recoveries and a
persistent curved miss. A new successful read may cost more than its old miss.
See the 0.3.7 section of [PERFORMANCE.md](../../../PERFORMANCE.md) for the results.

```sh
git show f090e489422507f57e30f50b6c8d5f6efdc4993a:wasm/qr.wasm > "$scratch/before.wasm"
QR_RIVALS="$scratch/rivals" node "$evidence/paired.mjs" "$PWD" "$scratch/build" wasm "$scratch/before.wasm" "$PWD/wasm/qr.wasm" > "$scratch/timing.json"
```

Use `ts` instead of `wasm` for TypeScript. These are desktop measurements,
not mobile latency or worst-case time bounds. The maximum is now five second
looks and 7,187,500 alignment probes; finder/map search remains capped at 720
maps. The original four attempts retain their order. Four attempted-candidate
records add bounded metadata. The final optional mesh adds up to 31,329 retained
module bytes and grey probes, each interpolating four pixels; combined retained
grid storage is at most 156,645 module bytes plus metadata. Grey probes are not
included in `Work.probed`. The extra attempt also performs normal mesh, timing
and edge refinement, so its cost is not limited to capturing the grid.

The standalone 70-frame WASM pack passes with all 560 counters matching. A
1,000-round allocation check includes 63 reads spread over five recovery
fixtures. Linear memory capacity stays at 4,325,376 bytes after the 200-call
warm-up; the deliberately unfreed-handle control grows. This is capacity, not
peak live allocation. Browser and worker consumer checks also pass.
