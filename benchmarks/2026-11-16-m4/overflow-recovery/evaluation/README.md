# Overflow candidate regression gates

Source preparation only; these scripts have not been executed here. The builder takes baseline TypeScript exclusively from Git revision `c6f05a9808df82365e5999aa5f00951093558a43`, then substitutes only the two frozen candidate source files whose hashes it verifies. It transpiles uninstrumented ESM for both; it does not build or represent a candidate WASM binary. It extracts pinned fixture helpers from the same revision. The destination must not exist.

On the execution host, set `QR_RIVALS` to the isolated dependencies containing qrcode 1.5.4 and zxing-wasm 3.1.7. The repository must have its installed TypeScript dependency and the cached 184 photo files. Example, substituting paths on that host:

```sh
node build.cjs "$REPO" "$CANDIDATE_SRC" "$NEW_BUILD_DIR"
node regression.mjs "$REPO" "$NEW_BUILD_DIR" perspective "$NEW_PERSPECTIVE_RECEIPT"
node regression.mjs "$REPO" "$NEW_BUILD_DIR" photos "$NEW_PHOTOS_RECEIPT"
node regression.mjs "$REPO" "$NEW_BUILD_DIR" stress256 "$NEW_STRESS_RECEIPT"
node regression.mjs "$REPO" "$NEW_BUILD_DIR" validation192 "$NEW_VALIDATION_RECEIPT"
node regression.mjs "$REPO" "$NEW_BUILD_DIR" synthetic96 "$NEW_SYNTHETIC_RECEIPT"
```

`CANDIDATE_SRC` is the directory containing `locate.ts` and `decode.ts`, not its parent. Every receipt path must be new. A nonzero exit marks a failure. Open fresh160 only after all five receipts pass and are bound to the same independently verified candidate JS identity.

The builder records per-source hashes, fixture hashes, TypeScript version, builder hash and ESM directory hashes in `identity.json`. Each JS directory hash is SHA-256 over sorted `.js` basenames, each immediately followed by the raw bytes of that file. The runner rechecks source hashes against pinned Git, candidate anchors, JS directories, fixture identities, rival versions and pinned rival binaries. Each receipt records `suite`, `passed`, `baseJsSha256`, `candidateJsSha256`, input hashes, runner and identity hashes, and per-reader outcomes. It checks unchanged input after every decoder and requires every baseline success to survive with identical text and bytes. The perspective case must also recover its known exact payload. Known synthetic positives require their exact text and bytes; known negative frames reject any read. Photo ground truth supplies expected text only, so the runner validates photo text and preserves the baseline raw bytes but does not claim an independent expected-byte oracle for photos. Photo payloads are represented by hashes, never stored as plaintext in receipts.

The 256 stress cases are the previously evaluated, now known set; they are distinct from the still-sealed fresh160. This script performs no timing. Baseline, candidate and ZXing use the same immutable frame; frame hashes and separately converted RGBA hashes are recorded. Each individual execution writes its receipt exclusively, so interrupted runs may leave an incomplete receipt which must not be treated as passing.
