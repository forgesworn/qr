# Deferred curved-map recovery, 0.3.3

Baseline: released commit `b1cf94d31c196ce996c7eb723cb37aa4575af660` (0.3.2).
The candidate source hashes are fixed in `build.cjs`; source in all other
TypeScript files comes from the baseline. Evaluation ran on the Apple M4 Max
using native Node 24.21.0. No instrumented code is used in the final regression
or timing receipts.

The new recovery finds one additional photograph, taking exact text accuracy
from 179/184 to 180/184. All earlier complete QR results survive across 888
cases; the 64 negative controls remain unread. The other positive totals stay
174/192, 172/224, 92/96 and 69/128. ZXing-WASM 3.1.7 reads 171/184 photographs
correctly. Expected photograph text is checked exactly; those files are not an
independent oracle for raw QR payload bytes. Synthetic cases check both.

The target's original mesh accepts 22 of 33 lattice nodes. A single late
sweep from frozen accepted anchors accepts the remaining 11, using unchanged
search windows and pattern tests. The public decoder admits this map from an
exact version word and non-conflicting format evidence; the successful result
still passes strict final format agreement and ordinary decoding checks. It
uses 450 maps, two second looks and 781,250 probes. Earlier success paths retain
priority, and the shared four-second-look cap is unchanged.

Further diagnostics recover seven of 16 target transformations, versus zero
before. Inverted variants remain unread. A separately generated 18-case curved
sheet family is unread by both QR versions. These are limitations, not omitted
failures or a claim of broad curvature superiority. The existing 160-case
qualification set is previously evaluated regression data, not a fresh holdout.

## Evidence

- `regression.json`: per-case baseline, candidate and pinned ZXing outcomes,
  pixel hashes, source identities and work counts; no private photo payloads.
- `backends.json`: all 888 qualified outcomes checked against the distributed
  TypeScript and packaged WASM, complete result equality and unchanged pixels.
- `transforms.json`, `sheet.json`: the additional geometry checks above.
- `browser.json`: headless Chrome main-thread, worker, charset and session checks.
  Its checkout HEAD is the baseline; its recorded WASM hash identifies the tested
  candidate bytes. This is browser execution, not physical-camera acceptance.
- `ts-1.json`, `ts-2.json`, `wasm-1.json`, `wasm-2.json`: independent paired
  processes, alternating order, 60 measured pairs after at least 10 warm-up
  pairs and 500 ms; input/output checks are outside the timed calls.

WASM clean/blank medians vary within 0.5%; main 720p noise increases about 0.2%.
Three other noise cases vary from -0.1% to +0.6%. TypeScript main noise changes
by 0.0–0.9%; other noise cases increase 0.5–1.3%. The new correct photo read takes
about 22.2 ms in WASM versus an earlier 12.1 ms miss, and about 49.8 ms in
TypeScript versus a 27.8 ms miss. These are desktop measurements.

## Reproduce

Use the release checkout with its normal npm dependencies and hash-verified
photo cache (`npm run fetch-photos`). Install `qrcode@1.5.4` and
`zxing-wasm@3.1.7` in a separate comparison directory, never as project
runtime or development dependencies. The runners verify versions, the rival
WASM hash and generated fixture hashes. Keep `$QR_RIVALS` absolute.

```sh
export QR_RIVALS=/absolute/path/to/isolated-rivals
EVIDENCE=benchmarks/2026-11-16-m4/curvature-recovery
node "$EVIDENCE/build.cjs" "$PWD" /tmp/qr-curvature-build
node "$EVIDENCE/regression.mjs" "$PWD" /tmp/qr-curvature-build "$QR_RIVALS" /tmp/qr-curvature-regression.json
npm run build
node "$EVIDENCE/verify-backends.mjs" "$PWD" /tmp/qr-curvature-build "$QR_RIVALS" /tmp/qr-curvature-regression.json /tmp/qr-curvature-backends.json
node "$EVIDENCE/transforms.mjs" "$PWD" /tmp/qr-curvature-build /tmp/qr-curvature-transforms.json
node "$EVIDENCE/sheet.mjs" /tmp/qr-curvature-build "$QR_RIVALS" /tmp/qr-curvature-sheet.json
git show b1cf94d31c196ce996c7eb723cb37aa4575af660:wasm/qr.wasm > /tmp/qr-curvature-before.wasm
node "$EVIDENCE/paired.mjs" "$PWD" /tmp/qr-curvature-build ts /tmp/qr-curvature-before.wasm "$PWD/wasm/qr.wasm" > /tmp/qr-curvature-ts.json
node "$EVIDENCE/paired.mjs" "$PWD" /tmp/qr-curvature-build wasm /tmp/qr-curvature-before.wasm "$PWD/wasm/qr.wasm" > /tmp/qr-curvature-wasm.json
```

Use new output paths. Run timings without concurrent builds or tests. Keep
Rust's ordinary worktree `target/` when rebuilding WASM. Remove your temporary
build and comparison files once their required evidence is retained.

The photo baseline was regenerated, changing only the recovered photo and the
floor from 179 to 180. No encoder or conformance vector changed. Local checks
include 474 TypeScript tests with photos required, Rust tests, Kotlin tests and
its regenerated-photo-floor check, and the full TS/WASM backend comparison.
CI additionally verifies reproducible WASM bytes and registry package shapes.
