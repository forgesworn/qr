# QR codes that your application controls

**Generate, render and read QR codes with one dependency-free TypeScript
package.** Add WebAssembly for faster decoding, or use plain JavaScript. Keep
your camera interface, your pixels and your deployment under your control.

```sh
npm install @forgesworn/qr
```

```ts
import { encode, toSvg, decode } from '@forgesworn/qr'

const svg = toSvg(encode('https://example.com/'))
const result = decode(imageData) // RGBA or greyscale pixels
if (result) console.log(result.text)
```

[Try it in your browser](BROWSER.md#try-it) ·
[Installation, recipes and API](../README.md) ·
[Why choose QR?](CHOOSING.md) ·
[Benchmarks and accuracy](../PERFORMANCE.md) ·
[GitHub](https://github.com/forgesworn/qr) ·
[npm](https://www.npmjs.com/package/@forgesworn/qr)

## Useful from the first import

- **Make and read:** versions 1–40, all four error-correction levels, text and
  bytes, optimal mixed segmentation, SVG, canvas and terminal rendering.
- **Handle difficult frames:** rotated, tilted, mirrored, inverted and damaged
  codes, with bounded recovery and checks against incorrect payloads.
- **Scan successive frames:** tracked camera sessions search the previous region
  first and recover through the full frame when needed. Every call reads fresh
  pixels; payloads are never cached.
- **Choose your runtime:** browsers, Web Workers and Node 22.13+, typed ESM,
  optional WASM through a separate import, JSR for Deno, a native Rust crate and
  Kotlin/JVM on Maven Central.
- **Inspect and reproduce:** MIT licence, no runtime dependencies, a detailed
  specification, shared vectors and public benchmark receipts.

The library does not open a camera, upload frames or require a hosted service.
Your application supplies pixels and decides what to do with the result.

## Accuracy is the priority

The 0.3.15 TypeScript and WebAssembly builds each read **180 of 184 labelled
reference photographs** with zero text mismatches. The fixture manifest and
runner let you repeat the check. [See the results and reproduce them](CHOOSING.md#photograph-comparison).

## Pick the right tool

QR is a good fit for applications that need QR generation and pixel decoding
without a runtime dependency tree or a prescribed UI. It reads ordinary QR
Code Model 2, one result per call. Choose a broader barcode library if you need
other symbologies, or a camera wrapper if you want a complete scanning interface.

## Documentation and distribution

- [Generate and read QR codes in a browser](BROWSER.md)
- [Decode QR codes from a luminance plane in Kotlin](KOTLIN.md)
- [Generate QR codes without heap allocation in embedded Rust](EMBEDDED.md)
- [Full API and integration recipes](../README.md)
- [Choosing QR and comparing alternatives](CHOOSING.md)
- [Specification](../SPEC.md)
- [Performance methodology and results](../PERFORMANCE.md)
- [Release notes](../CHANGELOG.md)
- [Security reporting](../SECURITY.md)
- [Distribution and release verification](DISTRIBUTION.md)
- [Native Rust crate](https://crates.io/crates/forgesworn-qr) and [Rust API](https://docs.rs/forgesworn-qr)
- [JSR package](https://jsr.io/@forgesworn/qr) and [Kotlin on Maven Central](https://central.sonatype.com/artifact/io.github.forgesworn/qr)
- [Concise machine-readable documentation](../llms.txt)
- [Complete documentation as plain text](../llms-full.txt)
