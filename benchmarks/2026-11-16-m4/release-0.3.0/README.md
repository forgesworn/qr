# QR 0.3.0 release qualification

Accuracy takes priority over rejection speed. The final version-directed
recovery reads `blur-noise-25`, previously missed, without losing another
success. Every frozen stress image keeps its original pixel hash.

## Evidence

- `stress.json`: all 256 frozen outcomes, including 171/224 correct positives
  for TypeScript and WASM versus 150/224 for ZXing-WASM 3.1.7. Both readers
  return no wrong positive payload and no false read on 32 negative controls.
  TypeScript and WASM agree on every payload/outcome.
- `stress-delta.json`: per-case comparison with the original qualification;
  the only change is recovery of `blur-noise-25` in TypeScript and WASM.
- `validation.json`: all 192 previous synthetic regression cases, retaining
  172 correct reads with no wrong payload or lost baseline success; ZXing 169.
- `libraries.json`: matched direct latency, encoding and accuracy comparisons;
  photographs remain 179/184 for TypeScript/WASM and 171/184 for ZXing. QR has
  no wrong photographic text; the rival's per-case wrong results are retained.
- `sessions.json`: the independent ten-frame moving/changing-payload sequence.
- `browser.json`: Chrome page/worker, character-set and session checks.
- `paired-1.json`, `paired-2.json`: two paired old/new timing forks of the
  accuracy change before the final Rust packaging changes. They name their
  exact binaries. Main noise costs 0.16–0.47% and 512-square noise 0.59–1.67%;
  other changes are small and mixed. This is not a speed-improvement claim.

The final distributed module is 210,401 bytes, SHA-256
`1bb093068c3ad93f7c6ecc17476ec03f5909cf7bea4966f361593c824d56c441`.
The pre-packaging recovery module used in the paired tests is 210,405 bytes,
`04fa6f57a06acffc9f153e80ae870d8e8c4081d52c5ab631c0bab7b8ec07cdbf`.
The final packaging adds crate metadata, documentation, a self-contained unit
fixture and checked native renderer dimensions. The full direct accuracy,
latency and browser comparisons were repeated on the final module. Receipts
record their source parent plus a dirty flag; exact JavaScript/WASM hashes bind
these measurements to the implementation committed with this report.

## Reproduction

Use the pinned external rivals (`qrcode 1.5.4`, `zxing-wasm 3.1.7`), native arm64
Node 24.21.0 on M4 Max, and the checked-in photograph download manifest.
No rival is a shipped or additional development dependency of QR.

```sh
npm ci
npm run fetch-photos
QR_REQUIRE_PHOTOS=1 npm run check
npm run check:package
npm run check:docs
node scripts/validate-decoders.mjs /path/to/previous/dist /path/to/rivals
node scripts/compare-libraries.mjs /path/to/rivals
node scripts/compare-sessions.mjs /path/to/rivals
node scripts/check-browser.mjs
```

For the frozen stress harness, set `QR_RIVALS`, `QR_EXPECT_JS_SHA256` and
`QR_EXPECT_WASM_SHA256` from the actual build, then run
`benchmarks/2026-11-16-m4/fresh256-qualification/qualify.mjs` with repository,
dist and a new output filename. It refuses changed corpus identities or an
existing output file. These cases have been evaluated and used for the new
recovery: they are regression data, never unseen validation again.

## Release gates and limits

TypeScript typechecking and 465 tests pass with photographs required; Kotlin
passes 119 tests with photographs required. Rust passes 45 unit/integration
tests plus its doctest; the extracted crate independently passes 25 library
tests and its doctest. Rust documentation builds with warnings denied. The
62-frame generated conformance pack exercises the new real recovery in all
three ports. npm consumer tests install the packed archive with scripts
disabled and verify the API, WASM bytes, complete results and disposal.

CI additionally checks both supported Node lines, Java 17, the independently
rebuilt WASM bytes on Linux, standalone WASM/native results, renderings and
memory release. GitHub release workflows provide the final CI/publication
receipts; local checks alone are not evidence of registry publication.

Both readers miss all 28 finder-occlusion stress images. ZXing alone reads one
remaining perspective image and is substantially faster on random noise.
These finite synthetic/photographic and desktop-browser results do not prove
physical-camera, mobile-battery or universal accuracy superiority.
