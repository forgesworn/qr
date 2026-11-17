# Same-call selected mesh: paired timing

Run only after root has built and qualified the release candidate, using the copied sibling generators, qualification and production identity verifier. Baseline is released commit 0fdcd6262f0cd5ddcd7ec6bfba5d131df01c9a37 (0.3.12); the baseline WASM must hash to `344c36527203940f149186fc6421d355617b90f26881309422500e474aec6066`. The identity verifier binds current candidate sources, emitted JavaScript and WASM. Set `QR_RIVALS` to the locked rivals directory and set `QR_EXPECTED_WASM_SHA256` and `QR_EXPECTED_WASM_BYTES` to the final candidate values supplied by root; the verifier fails closed without them.

```sh
export QR_RIVALS=LOCKED_RIVALS_DIRECTORY
export QR_EXPECTED_WASM_SHA256=FINAL_CANDIDATE_SHA256
export QR_EXPECTED_WASM_BYTES=FINAL_CANDIDATE_BYTE_COUNT
node paired.mjs ROOT BUILD ts > NEW_TS_RECEIPT
node paired.mjs ROOT BUILD wasm BASELINE_WASM PRODUCTION_WASM > NEW_WASM_RECEIPT
node compare-current.mjs ROOT BUILD RIVALS > NEW_RIVAL_RECEIPT
```

Use fresh receipt paths. The 51 paired cases retain established controls, including earlier alternate-grid and header-rediscovery gains as baseline successes. All five new qualification gains and both selected-header persistent misses are included and bound to qualification statuses and pixel hashes. The wider qualification remains the accuracy gate.

Each decode is timed alone; full stable-result and input checks run outside the timing bracket. The runner records at least 10 warm-up pairs and 500 ms warm-up, then 60 alternating-order measured pairs with raw samples and identity. The rival comparison uses the established clean timing fixtures; timing is not an accuracy claim. No execution has been performed during preparation.
