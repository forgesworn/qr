# Scratch alignment row index prototype

This scratch-only candidate starts from commit `497d12a91742899fe8ed2801c81bd720398cb94c`. Recreate the source from that commit and apply `prototype.patch` at its root. The candidate was rejected after two M4 processes found every noise case slower. See `paired1.json` and `paired2.json`; the binary is not distributed.

SHA-256:

- `rust/src/place.rs`: `cf3803d82c04d91f549edd83ff4f99a0a9ff8ec4197e7172108d03a5ebd91833`
- `rust/src/decode.rs`: `e5e8852527b79dd1d42b2676d578bb12147e15194dcf0d893e7e2dbb4bf1275e`
- All 10 `rust/src/**/*.rs` files, sorted by path and hashed by concatenating each UTF-8 relative path followed immediately by its bytes: `c9b98edffca5c95534f9e669cc9fdb098924bf39e0f5f2c7c56038530c0e5f2a`.
- `prototype.patch`: `f0e4aab2f1b8942e38002b1ca4114dc8736eda91fb4fd535ec1c3c397ca4fd00`
- `candidate.wasm`: `0d257b5827d8c5b20156dc31227a27feab4c5b2a0f6aa43cc1171c5ac6d0b777` (215,878 bytes).

The scratch `rust/target` symlink points to the worktree's `rust/target`; `vectors` points to the worktree's `vectors`. These paths are machine-specific; recreate the links for another checkout and continue to use its existing target. No `CARGO_TARGET_DIR` or `CARGO_INCREMENTAL` override is needed. The WASM candidate was built using `rustc 1.94.1 (e408947bf 2026-03-25)` with the same options as `scripts/build-wasm.mjs`:

```sh
cd /private/tmp/qr-alignment-row-prototype-497/rust
RUSTFLAGS='--remap-path-prefix=/private/tmp/qr-alignment-row-prototype-497/=. -C strip=symbols' \
  rustup run 1.94.1 cargo build --locked --release --features host-text \
  --target wasm32-unknown-unknown -j 1
cp target/wasm32-unknown-unknown/release/forgesworn_qr.wasm ../candidate.wasm
```

The canonical `/private/tmp` prefix above is the exact path remapped for this build. For a different scratch root, remap that canonical root instead. Copy the output to a new file when checking reproducibility so the retained candidate remains immutable.

`cargo test -j 1` passed 17 unit, 9 conformance and 11 encoder tests (37 total). New tests compare scalar and warmed indexed paths to an independent pixel-run oracle across short binary rows and windows, exercise chunk boundaries, tails, inverse polarity and long runs, compare repeated cached alignment searches to the existing reference including work, compare ordered locations and work across shared size hints, and decode the four one- and two-pixel finder-centre fixtures with padding 4 and 5. The coordinator separately reported 89 ABI result/frame-hash comparisons passed for the candidate.

The patch and hashes preserve the rejected implementation without retaining a second source tree or binary. The observation tools and receipts are alongside this file. To reproduce the 89 ABI comparisons, build the diagnostic fixtures with `build.cjs`, then run `node check-candidate.mjs <checkout> <generated-dir> <candidate.wasm>`. That comparison checks complete public results and input bytes; work counters are covered by the native suite. The fresh 256-frame stress set was not evaluated.
