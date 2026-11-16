# Inverse-luminance curved-map recovery, 0.3.4

Baseline: released `d6d91b17a0cca31dbb4f6008a4f6b584049ef027` (0.3.3).
`build.cjs` pins the candidate TypeScript source hash. Execution used the Apple
M4 Max and native Node 24.21.0, with no concurrent builds during paired timings.
Final regression and timing code is uninstrumented.

The existing inverse-luminance fallback already samples the correct map for
the inverted dense curved photograph, but ordinary two-copy format agreement
refuses it before curvature admission. Retain qualifying maps in a separate
four-entry list, using the existing exact-version and non-conflicting-format
gate. Earlier paths and the original-luminance curvature queue retain priority.
Only remaining second looks can process the new list, against the same inverse
luminance and its thresholds. Final decoding and format checks are unchanged.

No finder, size or map searches are added. The 720-map, four-second-look and
5,750,000-probe caps remain. Two lists can retain eight candidates in total,
and the inverse image stays live longer: up to one byte per picture pixel.

## Accuracy and limits

| Set | 0.3.3 | 0.3.4 |
|---|---:|---:|
| Target photo: rotations, mirrors and both polarities | 7/16 | 14/16 |
| All 184 photos with the same 16 transformations | 2,863/2,944 | 2,870/2,944 |
| Original photographs | 180/184 | 180/184 |
| Synthetic curved sheets | 0/18 | 0/18 |

The seven added reads are inverted views of the same photograph, not seven
independent photos. Its unmirrored 180-degree view remains unread in either
polarity. The sheet gap remains. Previously successful complete TypeScript
results survive; no wrong QR text or false reads were found. Photograph oracles
independently supply text only; synthetic regression cases also check bytes.

The 888-case regression keeps its previous positive totals and rejects all
64 negative controls. Packaged WASM matches all declared TypeScript result
fields on those cases and all 2,944 transformed photo cases. Point comparisons
include public x/y coordinates, excluding TypeScript's internal finder counts.
Input bytes are checked after each call. These are related regression images,
not unseen camera validation or a claim of universal superiority.

## Timing and memory

Each of two independent processes per backend alternates baseline/candidate
order for 60 measured pairs, following at least ten warm-up pairs and 500 ms.
Output and input checks sit outside timed calls. Main-noise WASM medians change
by +0.1% and -0.5%; clean/blank variation stays within 1.3%. TypeScript main
noise varies from -0.3% to +0.9%, with clean/blank variation up to 3.7% across
these short runs. This is no evidence for a general speed improvement.

The newly readable inverted photo costs more: WASM 22.58–22.60 ms versus
12.56–12.76 ms for the old miss; TypeScript 50.21–50.31 ms versus
28.34–28.36 ms. Both WASM instances end the fixture sequence with 14,483,456
bytes of linear memory in both runs. That is allocated linear-memory capacity,
not a measurement of peak live allocations or a guarantee for other images.

## Evidence and reproduction

- `regression.json` and `backends.json`: 888 exact outcomes and public backend
  parity, pinned source/input identities and negative controls.
- `photo-transforms.json`: all 2,944 outcomes, preservation of previous results,
  work limits and public TypeScript/WASM parity, without decoded photo contents.
- `transforms.json` and `sheet.json`: target geometry and remaining sheet gap.
- `ts-1.json`, `ts-2.json`, `wasm-1.json`, `wasm-2.json`: paired timing samples,
  source/binary hashes and WASM memory capacities.
- `browser.json`: headless Chrome main-thread/worker, character-set and session
  checks. Its checkout HEAD is the baseline; the recorded WASM hash binds the
  candidate bytes. This is browser execution, not physical-camera acceptance.

Local checks pass: 475 TypeScript tests with photos required; Rust's unit,
conformance, encoder and documentation tests; Kotlin's full suite including
the new inverse-photo regression; a native Rust inverse-photo read; packaged
consumer checks; and generated-documentation checks. The new public regression
was observed failing against 0.3.3 before the fix.

Use the release checkout, normal npm dependencies and hash-verified photos
(`npm run fetch-photos`). Install `qrcode@1.5.4` and `zxing-wasm@3.1.7` in an
isolated comparison directory, never the project's dependencies. Runners bind
the original fixture identities and pinned rival WASM. Keep output paths new.

```sh
export QR_RIVALS=/absolute/path/to/isolated-rivals
EVIDENCE=benchmarks/2026-11-16-m4/inverted-curvature-recovery
node "$EVIDENCE/build.cjs" "$PWD" /tmp/qr-inverse-build
npm run build
node "$EVIDENCE/regression.mjs" "$PWD" /tmp/qr-inverse-build "$QR_RIVALS" /tmp/qr-inverse-regression.json
node "$EVIDENCE/verify-backends.mjs" "$PWD" /tmp/qr-inverse-build "$QR_RIVALS" /tmp/qr-inverse-regression.json /tmp/qr-inverse-backends.json
node "$EVIDENCE/photo-transforms.mjs" "$PWD" /tmp/qr-inverse-build /tmp/qr-inverse-photo-transforms.json
node "$EVIDENCE/transforms.mjs" "$PWD" /tmp/qr-inverse-build /tmp/qr-inverse-transforms.json
node "$EVIDENCE/sheet.mjs" /tmp/qr-inverse-build "$QR_RIVALS" /tmp/qr-inverse-sheet.json
git show d6d91b17a0cca31dbb4f6008a4f6b584049ef027:wasm/qr.wasm > /tmp/qr-inverse-before.wasm
node "$EVIDENCE/paired.mjs" "$PWD" /tmp/qr-inverse-build ts /tmp/qr-inverse-before.wasm "$PWD/wasm/qr.wasm" > /tmp/qr-inverse-ts.json
node "$EVIDENCE/paired.mjs" "$PWD" /tmp/qr-inverse-build wasm /tmp/qr-inverse-before.wasm "$PWD/wasm/qr.wasm" > /tmp/qr-inverse-wasm.json
```

Keep the worktree's Rust target directory. Run timing processes serially without
other builds/tests, and remove task-created scratch after retaining evidence.
