# AGENTS.md: qr

Instructions in this file apply to the entire repository.

## Project Summary

`@forgesworn/qr`: a QR code encoder with no runtime dependencies, for
browsers, workers and Node. ESM only, Node.js `>=22.13`. SPEC.md defines
the encoder exactly. The decoder is in `src/` too. A pure-JVM Kotlin port of
both is in `kotlin/`; a Rust port is planned to the same spec and the same
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
- `vectors/generator/` - the Java generator; `.cache/` holds the
  hash-checked jar and is not committed.
- `test/` - Vitest suites.
- `kotlin/core/src/main/kotlin/dev/forgesworn/qr/` - the Kotlin port; it is
  vendored as a unit, so keep it self-contained (no Android or third-party
  imports). `kotlin/core/src/test/` reads `vectors/` and uses ZXing as a
  test-only oracle.

## Release

Releases publish through the anvil reusable workflow (`release.yml`) with
npm trusted publishing. Do not publish by hand.
