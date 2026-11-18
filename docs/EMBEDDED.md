# Generate QR codes on ESP32 with allocation-free Rust

`forgesworn-qr-embedded` is a `no_std` QR encoder for versions 1–8 with all
four error-correction levels. It uses caller-owned buffers and requires no
heap allocator, operating system or display driver. The crate supports Rust
1.87 or later.

```toml
[dependencies]
forgesworn-qr-embedded = "0.1.1"
```

## Encode text and inspect the modules

```rust
use forgesworn_qr_embedded::{encode_simple_text, Options, Workspace, MODULE_BYTES};

fn main() {
    let mut workspace = Workspace::new();
    let mut output = [0; MODULE_BYTES];
    let code = encode_simple_text(
        "https://example.com/esp32",
        &Options::default(),
        &mut workspace,
        &mut output,
    ).expect("the example fits in versions 1–8");

    assert!(code.is_dark(0, 0));
    println!("{} modules per side", code.size());
}
```

The host example prints the symbol size. On a board, read `code.is_dark(x, y)`
in your display loop while the result is alive and leave a four-module
quiet zone around it. The result clears its output buffer when dropped.

The default encoder needs a **242-byte workspace and a 301-byte output
buffer**, for **543 bytes of caller-owned buffers**. Those are buffer sizes.
Your stack also holds call frames and temporary values. Use `encode_bytes`
for raw bytes. Enable the `optimal` feature and supply a `TextPlanner` for
mixed-mode text planning, bringing the caller-buffer total to 1,063 bytes.

This crate encodes only. The
[full Rust crate](https://docs.rs/forgesworn-qr) includes image decoding and
handles versions 1–40. See the
[embedded guide](../rust/embedded/README.md#footprint-comparison) for the
linked ESP32 probe sizes, conformance results and buffer wiping contract.
