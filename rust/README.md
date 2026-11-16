# forgesworn-qr

A QR code encoder and image decoder with no runtime dependencies. Encode text
or bytes, decode greyscale or RGBA pixels, and render SVG or terminal text.
Rust 1.96 or newer is required. Licensed under MIT.

```toml
[dependencies]
forgesworn-qr = "0.3"
```

```rust
use forgesworn_qr::{encode, render, symbol};

let code = encode::encode("Made with QR", &encode::Options::default())?;
let svg = render::to_svg(&code, &render::SvgOptions::default());
assert!(svg.starts_with("<svg"));

let decoded = symbol::decode_modules(&code.modules, code.size)
    .expect("the generated grid is readable");
assert_eq!(decoded.payload.text, "Made with QR");
# Ok::<(), forgesworn_qr::encode::Error>(())
```

For pictures, use `decode::decode`. Pass a byte slice, width, height, channels
(`1` for greyscale or `4` for RGBA), row stride **in pixels**, an
`Inversion` choice, and `None` for optional work counters. Transparent RGBA
pixels are blended onto white. The returned `Reading` includes payload,
orientation, polarity and finder locations. There is no camera integration,
PNG/JPEG loader or canvas renderer in the crate.

## API and input contracts

The supported application entry points are `encode::encode`,
`decode::decode`, `symbol::decode_modules`, `render::to_svg` and
`render::to_terminal`, together with their option and result types.
Version 0.3 is a pre-1.0 release: breaking API changes require a new minor
version. The publicly accessible pipeline stages (`front`, `binarise`,
`locate`, `place`, `refine`, tables and low-level symbol routines) are
implementation APIs. They require valid dimensions, buffers and intermediate
state; they can panic on malformed inputs and are not the recommended entry
points for untrusted images.

- Encoding validates options and QR capacity and returns `Result`.
- Picture decoding validates channels, dimensions, stride and buffer length,
  including overflow. Invalid input and an unreadable image both return `None`.
- Grid decoding accepts legal QR side lengths from 21 to 177 in steps of four
  and rejects invalid dimensions or short buffers with `None`. Nonzero module
  bytes mean dark. Both ordinary and transposed grids are tried.
- Renderers require an unmodified `QrCode` returned by the encoder. Their
  string options are escaped for XML. A margin whose resulting side cannot
  fit in `usize` causes an explicit panic. Bound caller-supplied margins:
  terminal output grows quadratically, and ordinary allocation limits still
  apply. Public struct fields do not validate manually constructed values.

The decoder reads one symbol per call. It reports structured-append metadata
but does not assemble multiple symbols. As with any parser working on large
images, applications should impose input-size and resource limits appropriate
to their environment.

## Character sets and WebAssembly

Native Rust and the default standalone WebAssembly build contain no character
tables. Kanji and most ECI text follow the
[SPEC platform-without-tables rules](https://github.com/forgesworn/qr/blob/main/SPEC.md);
Hanzi symbols are refused. Payload bytes and decoded text are distinct fields;
do not assume every supported byte sequence has decoded Unicode text.

The `host-text` feature is for the packaged JavaScript WebAssembly adapter. On
WebAssembly it requires that adapter's text-decoding import; it is not a
general native character-set feature. The npm package `@forgesworn/qr` supplies
the browser/worker adapter and separately qualified WASM asset.

## Conformance and evidence

The TypeScript, Kotlin and Rust implementations share a
[specified decoder](https://github.com/forgesworn/qr/blob/main/SPEC.md) and
generated conformance vectors. The published crate includes self-contained
library unit tests and this doctest. The repository's larger cross-language
tests, photo corpus and benchmark harnesses live in the repository and are
not included in the crate archive.

[Measured results and limitations](https://github.com/forgesworn/qr/blob/main/PERFORMANCE.md)
identify exact builds, corpora and hardware. WebAssembly measurements are not
native Rust latency measurements; synthetic images are not physical-camera
qualification. QR does not claim to outperform ZXing on every workload.

[Project documentation](https://forgesworn.github.io/qr/) ·
[Source and issues](https://github.com/forgesworn/qr) ·
[Security reporting](https://github.com/forgesworn/qr/blob/main/SECURITY.md)
