# AGENTS.md: qr

Instructions in this file apply to the entire repository.

## Project Summary

`@forgesworn/qr`: a QR code encoder and decoder with no runtime dependencies, for
browsers, workers and Node. ESM only, Node.js `>=22.13`. SPEC.md defines
the encoder exactly. The decoder is in `src/` too. A pure-JVM Kotlin port of
both is in `kotlin/`; the `forgesworn-qr` Rust crate follows the same spec and
vectors.

## Commands

```bash
npm install
npm run build             # tsc into dist/
npm test                  # vitest: tables, ZXing vectors, jsQR round trips, API
npm run typecheck         # src and test, no emit
npm run check             # typecheck + test
npm run generate-vectors  # rebuild vectors/encode-vectors.json with ZXing (JDK needed)
(cd kotlin && ./gradlew test)   # the Kotlin port against the same vectors and frames
(cd rust && cargo test)         # the Rust port against the conformance pack
```

## Rules

- No runtime dependencies. ZXing (Java, through the generator) and jsQR
  (a devDependency) are test oracles only. Add no other QR library, even
  as a dev dependency.
- Behaviour changes go into SPEC.md in the same commit. A change that
  alters any vector needs a stated reason; regenerate rather than edit
  vectors by hand.
- Test payloads are throwaway: never a real room link, signer URI, invoice
  or seed.
- British English in prose and comments.

## Repository Structure

- `src/encode.ts` - mode, version, bit stream, Reed-Solomon, matrix, masks.
- `src/svg.ts`, `src/canvas.ts`, `src/terminal.ts` - renderers.
- `src/tables.ts` - Table 9 error correction blocks and Annex E centres.
- `vectors/encode-vectors.json` - module matrices from ZXing core 3.5.3.
- `vectors/conformance.json`, `vectors/conformance/` - the conformance pack
  for ports: greyscale, module grids, and each picture's stages, result and
  work counts. `vectors/README.md` describes every vector file. Regenerate
  with `QR_WRITE_CONFORMANCE=1 npx vitest run test/conformance.test.ts`;
  a change to it is a behaviour change.
- `vectors/generator/` - the Java generator; `.cache/` holds the
  hash-checked jar and is not committed.
- `test/` - Vitest suites.
- `rust/` - the native Rust crate, with no runtime dependencies: the whole
  decoder (ordinary search, second look and reduced sizes), the encoder
  (`encode`, optimal segmentation) and the SVG and terminal renderers; no
  canvas renderer.
  It bundles no character tables, so kanji and most ECI text is as
  SPEC.md gives for a platform without them, and it refuses hanzi symbols.
  `rust/examples/dump.rs` and `rust/bench/dump.mjs` print the same line
  for each reading, to be compared with `cmp`. Its tests read
  `vectors/conformance.json` and `vectors/encode-vectors.json`;
  `rust/examples/render_dump.rs` and `rust/bench/render-dump.mjs` print a
  hash per rendering for the same comparison; `rust/bench/` times its
  WebAssembly build against the TypeScript and checks the WebAssembly
  encoder against it. The module returns the whole decode result through
  raw handle exports (`read_picture`, `read_grid` and accessors, in
  `rust/src/lib.rs`), wrapped by `decodeFull` and `decodeGrid` in
  `rust/bench/loader.js`; `rust/bench/wasm-dump.mjs`, `wasm-symbols.mjs`,
  `wasm-pack.mjs`, `wasm-options.mjs` and `wasm-leak.mjs` check it against
  the TypeScript, the native Rust and the pack.
- `kotlin/core/src/main/kotlin/dev/forgesworn/qr/` - the Kotlin port; it is
  vendored as a unit, so keep it self-contained (no Android or third-party
  imports). `kotlin/core/src/test/` reads `vectors/` and uses ZXing as a
  test-only oracle.

## Release

Releases publish through the anvil reusable workflow (`release.yml`) with
npm trusted publishing. Do not publish by hand.
The Rust crate uses `release-rust.yml` against an existing release tag;
`docs/DISTRIBUTION.md` documents its initial publication and trusted publisher.
