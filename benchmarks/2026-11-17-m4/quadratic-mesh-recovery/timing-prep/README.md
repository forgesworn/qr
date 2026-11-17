# Reproducing 0.3.14 timings

Run on native M4 only after full production qualification. The two
persistent misses are chosen by the copied-source audit after actual terminal
sampling is observed. Legacy
Work omits the terminal quadratic threshold, sample and symbol operations.
WASM `linearCapacityBytes` is memory capacity, not live allocation.

Set ROOT, ARTIFACTS, RELEASED_DIST, RIVALS and BASELINE_WASM to existing paths.
Set QR_EXPECTED_WASM_SHA256 and QR_EXPECTED_WASM_BYTES to the final verified
0.3.14 manifest values. ARTIFACTS/production-backends.json must be present and
passed. Use distinct new output paths and capture terminal completion separately.
Before timing, classify actual terminal sampling misses with a copied-source
observer. Root executes these commands serially on M4; AUDIT_DIR must be new:

```sh
python3 "$ARTIFACTS/timing-prep/instrument-audit.py" "$ROOT" "$ARTIFACTS" "$AUDIT_DIR"
node "$ARTIFACTS/timing-prep/build-audit.cjs" "$ROOT" "$AUDIT_DIR"
node "$ARTIFACTS/timing-prep/run-audit.mjs" "$ROOT" "$ARTIFACTS" "$AUDIT_DIR"
```

The audit checks production, hooks-off and hooks-on complete raw TypeScript
results, legacy Work and input bytes against the frozen qualification. It
selects the first two misses that actually enter terminal sampling and the
first earlier success that retained a descriptor, scanning no more than the
known 1,376 cases. The callback is removed and a repeated read checked for each
selected case. It creates timing-audit.json exclusively; the paired runner
requires its source, WASM and pixel bindings. These are measured workload
classifications, not a decoder policy change or new accuracy validation.

Run two separate processes for each mode:

```sh
node "$ARTIFACTS/timing-prep/paired.mjs" "$ROOT" "$ARTIFACTS" "$RELEASED_DIST" "$RIVALS" ts "$BASELINE_WASM" > ts-1.json
node "$ARTIFACTS/timing-prep/paired.mjs" "$ROOT" "$ARTIFACTS" "$RELEASED_DIST" "$RIVALS" ts "$BASELINE_WASM" > ts-2.json
node "$ARTIFACTS/timing-prep/paired.mjs" "$ROOT" "$ARTIFACTS" "$RELEASED_DIST" "$RIVALS" wasm "$BASELINE_WASM" > wasm-1.json
node "$ARTIFACTS/timing-prep/paired.mjs" "$ROOT" "$ARTIFACTS" "$RELEASED_DIST" "$RIVALS" wasm "$BASELINE_WASM" > wasm-2.json
node "$ARTIFACTS/timing-prep/direct.mjs" "$ROOT" "$ARTIFACTS" "$RIVALS" > direct-1.json
node "$ARTIFACTS/timing-prep/direct.mjs" "$ROOT" "$ARTIFACTS" "$RIVALS" > direct-2.json
```

Each process warms at least ten pairs and 500 ms, then measures 60 alternating
pairs. Review each receipt and completion status before drawing conclusions.
The release execution passed the classification audit and all six timing processes;
`timing-completion.json` and `timing-summary.json` bind the archived results.
