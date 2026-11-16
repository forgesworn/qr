# Deferred mesh reading — M4 evidence

Baseline: QR 0.3.5, commit `b74fa2ff397369a247d70976cfd8ad5b7619588e`.
Candidate: the source hashes in the production receipts and packaged QR 0.3.6.
ZXing-WASM is 3.1.7; independent encoder is qrcode 1.5.4, installed only in
isolated benchmark scratch. Neither is a runtime dependency of QR.

The source change keeps a failed second look's unrefined mesh grid, at most four,
and validates these grids only after every earlier return path fails. Existing
successful results keep priority, including all their metadata. No alignment,
map or second-look budget increases. Capturing grids adds up to 125,316 grey
samples and module bytes per frame; these samples are not Work.probed, which
counts alignment searches. Final failure can add four strict grid reads.

| Dataset | 0.3.5 | 0.3.6 | ZXing |
|---|---:|---:|---:|
| Original photos | 180/184 | 180/184 | 171/184 |
| All photo transformations | 2,872/2,944 | 2,872/2,944 | Not run here |
| Evaluated curved sheets | 2/18 | 3/18 | Not run here |
| Evaluated distortion set | 30/96 | 37/96 | 42/96 |
| Newly frozen distortion set | 78/128 | 81/128 | 106/128 |

There are no lost reads or wrong QR payloads in these sets. All earlier complete
results remain identical in the 888-case regression and 2,944 transformed photos;
all 64 negative controls are rejected. Photos supply an independent text oracle;
synthetic cases additionally check exact bytes. Transformations of one photo
are related observations. The 128-case set was frozen before decoder imports
and evaluation, and is now regression data. It uses different versions, payloads,
scales, parabola/arch curves, signs, axes, rotations, mirrors and polarities.
Both distortion sets still favour ZXing overall; this is not a general lead.

`diagnostic-summary.json` records the 42-case stage investigation: all 30 old
successes plus 12 ZXing-only reads. The observer preserved every result, Work
counter and input byte. Reduced coordinates are scaled using the recorded image
dimensions. Four of the misses have only wrong-size refinement candidates;
several other meshes strictly decode before timing correction damages them.
`instrument.py`, `build.cjs`, `frames.mjs` and `run.mjs` reproduce the full trace
against a clean baseline checkout with its dependencies installed. These observer
builds perform additional probes and must never be timed.

`production-backends.json`, `production-photos.json`, `production-frozen.json`,
`production-new128.json` and `production-sheet.json` verify all declared public
TypeScript/WASM result fields and input preservation. The WASM SHA-256 is
`b5a1cc98846027deba1f42e6889db98a1d22d34e270d847363a369c0432bb36e`
(232,666 bytes, 5,390 more than 0.3.5).

## Reproduce accuracy

From the release checkout, with Node 24 and the repository dependencies installed:

```sh
npm ci
npm run build
npm run fetch-photos
scratch=$(mktemp -d)
evidence="$PWD/benchmarks/2026-11-16-m4/deferred-mesh-reading"
npm install --prefix "$scratch/rivals" --ignore-scripts --no-audit --no-fund --save-exact qrcode@1.5.4 zxing-wasm@3.1.7
node "$evidence/build-production.cjs" "$PWD" "$scratch/build"
node "$evidence/regression.mjs" "$PWD" "$scratch/build" "$scratch/rivals" "$scratch/regression.json"
node "$evidence/verify-backends.mjs" "$PWD" "$scratch/build" "$scratch/rivals" "$scratch/regression.json" "$scratch/backends.json"
node "$evidence/verify-photos.mjs" "$PWD" "$scratch/build" "$scratch/photos.json"
QR_WASM_ROOT="$PWD" node "$evidence/frozen.mjs" "$scratch/build" "$scratch/rivals" "$PWD/benchmarks/2026-11-16-m4/mesh-boundary-continuation/fresh-manifest.json" "$scratch/frozen.json"
QR_WASM_ROOT="$PWD" node "$evidence/verify-new128.mjs" "$scratch/build" "$scratch/rivals" "$evidence/new128-manifest.json" "$scratch/new128.json"
node "$evidence/sheet.mjs" "$scratch/build" "$scratch/rivals" "$scratch/sheet.json" "$PWD"
```

The new set's original generator is `new128.mjs`; its SHA is bound in the frozen
manifest. `verify-new128.mjs` regenerates exactly those inputs and adds final
packaged-WASM parity. Receipts bind generated JavaScript, source files, runners,
inputs and expected outputs with hashes. Keep the desired results, then remove
the scratch directory you created.

## Paired timings

`paired.mjs` uses alternating baseline/candidate order, at least ten warm-up pairs
and 500 ms warm-up, then 60 measured pairs per case. Two independent processes
are run for each backend, sequentially on the M4 Max with native Node 24.21.0.
No other build, test or timing job runs alongside them. Raw samples are retained
in `ts-1.json`, `ts-2.json`, `wasm-1.json` and `wasm-2.json`.

The extra cases include three new recoveries, a persistent curved miss, and a
previous success following failed meshes. A successful read can cost more than
its previous miss; compare result status alongside time. Reported WASM memory is
linear-memory capacity, not peak live allocation. The separate leak check warms
up, exercises the new reduced/inverted mesh fixtures repeatedly, and checks that
capacity stays flat; a control intentionally retaining handles grows memory.

```sh
git show b74fa2ff397369a247d70976cfd8ad5b7619588e:wasm/qr.wasm > "$scratch/before.wasm"
QR_RIVALS="$scratch/rivals" node "$evidence/paired.mjs" "$PWD" "$scratch/build" wasm "$scratch/before.wasm" "$PWD/wasm/qr.wasm" > "$scratch/timing.json"
```

Use `ts` instead of `wasm` for the TypeScript backend. Repeated measurements,
different hardware, cameras and images can give different results.
