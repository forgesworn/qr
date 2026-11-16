# Eager finder-event prototype

Pinned baseline: `f45056c323c28690dea59857e90a53eea3257e4c`. Production decoder sources are identical at `598894a6e1d57f603e2971d377500ba3a305d64d`.

Only scratch `rust/src/locate.rs` and `rust/src/decode.rs` differ. `eager.patch` applies to the repository root. No production source or packaged asset was changed.

The strict finder pass jointly classifies the original five-run windows, consumes strict results with its original successful-candidate skip, and retains loose eligibility in contiguous `u32` words. The loose pass enumerates those bits in order with its own successful-candidate skip. Windows skipped by strict are still classified. Each decode search owns its cache, so image and polarity lifetimes are separate. The ordinary standalone finder scan remains unchanged. A missing loose cache falls back to the ordinary scan.

Metadata is one three-`usize` span per scanned row (12 bytes on wasm32, 24 bytes on a 64-bit host), plus vector capacity and packed words. No runtime saving is claimed before paired measurement.

Added tests cover both predicates for 59,049 small count tuples; independent original row schedules for exhaustive small rows and random word tails; a strict-skipped window needed by loose; repeated cache replay; complete finder lists and work; normal/inverse images sharing edge positions but separate eligibility caches; and all four thin-centre regressions. The original full finder/row oracle and conformance tests are retained.

The M4 ran `cargo test --locked -j 1` with `rustc 1.94.1 (e408947bf 2026-03-25)`, host `x86_64-apple-darwin`: 18 unit, 9 conformance and 11 encoder tests passed (38 total). The diagnostic receipt also reproduced byte-for-byte on M4. The WASM build used `--release --features host-text --target wasm32-unknown-unknown -j 1` with `RUSTFLAGS="--remap-path-prefix=/private/tmp/qr-next-20261116/repo/=. -C strip=symbols"`. For another checkout, remap its canonical root instead.

The immutable WASM was 221,737 bytes, SHA-256 `b61bceeb3136726373ab4207ac5665fd56ccbe88075bc6a269a5e6be1b6aabf5`. All 89 complete ABI results and input hashes matched the packaged baseline. Two independent native arm64 Node processes on M4 measured main noise 5.0–5.1% faster and six other noise cases 3.7–8.5% faster, but stripes 6.0–6.2% slower and checkerboards 7.6–7.8% slower. See `eager-paired1.json`, `eager-paired2.json` and `eager-equivalence.json`. This variant was not integrated. The separate density fallback also failed its pattern-latency gate; see `density.md`. Neither changes acceptance rules. The Rust compiler host architecture and Node execution architecture are separate facts.

SHA-256 identities:

- Patch: `6e0ae61bbebfbcc2cd941c14f25d0cdc2d6a45b9059e8435af30711b53580135`
- `locate.rs`: `f296240b8336a3361742d1746b6b51e9a75180e5fd0eef8f5f16cfab05f1d0e3`
- `decode.rs`: `e924d3bb6a569ed5d27ac61dd3e59bdf10b6b04f6db20cd01c26da5327b8488d`

The patch recreates the source on the pinned baseline. Use the worktree's own Rust target; do not copy machine-specific target or vector symlinks. No production source or distributed WASM was replaced for this experiment.
