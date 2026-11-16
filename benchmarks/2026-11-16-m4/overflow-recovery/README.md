# Ranked-overflow recovery, QR 0.3.2

Late header screening recovers four additional exact payloads across the
existing synthetic suites. It preserves all prior successes. Photographs stay
179/184, versus ZXing-WASM 3.1.7 at 171/184. The separately frozen fresh 160-case set
reads 69/128 positives in both baseline and candidate, versus ZXing 55/128, with
all 32 negative controls rejected. This patch has no demonstrated additional
gain on that fresh set. See the table and limitations in PERFORMANCE.md.

## Evidence and identity

- `regression-results/`: five qualification receipts for the frozen candidate,
  including the known perspective frame, 184 photos, 256 stress cases, 192 validation cases and
  96 earlier synthetic cases. The perspective case is included in stress; it
  must not be counted as a fifth additional recovery.
- `fresh160/`: generator, photo helper and manifest frozen before evaluation.
  `fresh160-results.json` records the first evaluation. These cases are now
  regression data and must never be presented as unseen in subsequent tuning.
- `final-backends.json`: final packaged TypeScript/WASM equality on 888 cases,
  including complete normalised result equality between those two backends,
  payload equality with qualified receipts, exact pixels and input preservation.
  Photographic payloads are hashed rather than copied into the receipt.
- `paired-wasm-1.json`, `paired-wasm-2.json`: two separate processes, alternating
  before/after order, 60 rounds and at least 20 warm-ups plus one second per case.
  Main noise costs 3.6–3.9% more; additional noise controls cost 0.6–6.1% more.
  Clean/blank medians are broadly unchanged. This is not a speedup claim.
- `paired-ts-1.json`, `paired-ts-2.json`: TypeScript pilot and repeat, 25 rounds
  and 5 warm-ups. Main-noise overhead is approximately 3%.
- `overflow-perspective-proof.json`: the frozen case is recovered with three
  additional maps and no additional second look.

The source-only candidate was frozen at decode.ts SHA256
491e43c7cff8ccc5058b77341c7ed074ea2d0453958ac40390e2b1fd9307c02b and locate.ts
SHA256 d911b106051eb4a4cd7200c42634c18c9b2077e0ebfda12a06be5f3c7f3ec824.
The final packaged WASM is 217,706 bytes,
ca263eab7555cf8cc40474f9d05baa1d76a1fa0a154f2106ea3b2d31b5ecb32f.
All tests and timings ran on M4; no physical camera evidence is claimed.

## Reproduction

Keep rival packages outside this repository: qrcode 1.5.4 and zxing-wasm3.1.7.
Build the package, fetch the pinned photographs, then generate the frozen
comparison build from baseline commit c6f05a9808df82365e5999aa5f00951093558a43.
The builder requires the exact candidate source hashes above.

```sh
npm ci
npm run fetch-photos
node benchmarks/2026-11-16-m4/overflow-recovery/evaluation/build.cjs "$PWD" "$PWD/src" /tmp/qr-evaluation
QR_RIVALS=/path/to/rivals node benchmarks/2026-11-16-m4/overflow-recovery/evaluation/regression.mjs "$PWD" /tmp/qr-evaluation stress256 /tmp/stress-result.json
node benchmarks/2026-11-16-m4/overflow-recovery/verify-backends.mjs "$PWD" /tmp/qr-evaluation /path/to/rivals /tmp/final-result.json
node scripts/compare-wasm.mjs /path/to/0.3.0/qr.wasm dist/qr.wasm --negative
```

The remaining regression suite names are photos, validation192, synthetic96 and
perspective. Each output filename must be new. The first fresh qualification
runner and its explicit gate are preserved under `fresh-evaluation/`; reruns
are regression checks, not new unseen validation. Input hashes and receipt
counts must match; do not weaken checks to accept an altered fixture.

The focused test was observed failing on the old implementation and passing
on the new one. TypeScript passes 467 tests with photographs required; Rust
passes 26 library, 9 conformance, 11 encoder tests and its doctest; Kotlin's test
build passes with photographs required. The generated 63-frame conformance pack
adds the real perspective recovery and changes only three earlier failure
frames' map counts (+30 header probes each). Independent CI, package, browser
and public registry verification are recorded separately in release workflows.
