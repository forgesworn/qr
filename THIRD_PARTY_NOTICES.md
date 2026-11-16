# Third-party notices

ForgeSworn QR source is MIT licensed; see [LICENSE](LICENSE).

The optional bundled `qr.wasm` is compiled with Rust 1.96.0, commit
`ac68faa20c58cbccd01ee7208bf3b6e93a7d7f96`. Compiled Rust support code and
applicable upstream notices accompany the package in [licenses/](licenses/):

- `RUST-MIT.txt`: the Rust project licence, used under its MIT option.
- `RUST-STDLIB-DEPENDENCIES.txt`: notices for cfg-if, dlmalloc, foldhash and
  hashbrown from the pinned compiler's standard-library notice inventory.
- `COMPILER-BUILTINS.txt` and `LIBM.txt`: compiler built-in and mathematical
  support licences, including LLVM exceptions and third-party notices.
- `UNICODE-3.0.txt`: the Unicode data licence used by Rust's core library.

This is a conservative notice set; retaining a notice does not mean that every
component or function survives the WebAssembly linker's dead-code removal.
Platform-specific dependencies for other operating systems are not included.
The npm package has no runtime package dependencies. Test oracles, benchmark
rivals and the Markdown documentation builder do not ship as executable library
dependencies.
