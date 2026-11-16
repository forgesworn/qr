# Finder-event equal-run shortcut, scratch prototype

Baseline commit `f45056c323c28690dea59857e90a53eea3257e4c`. The complete patch `equal.patch` applies to that revision. `equal-incremental.patch` records only the change from the frozen original eager event prototype; the density variant is not included. No production or packaged asset was changed.

SHA-256:

- `rust/src/locate.rs`: `9e823ddd90760dc0c2f8e74b1dabb56644bbd629ef5114ea8fedf172e916ec9c`
- `rust/src/decode.rs`: `e924d3bb6a569ed5d27ac61dd3e59bdf10b6b04f6db20cd01c26da5327b8488d`
- `equal.patch`: `7a14b1cbb820960ee19814b7e87bcb472cc34a78a2e43c1097a2578006b3ca19`
- `equal-incremental.patch`: `a9a666a907693cd81d83bae35b3fa3f089f15346b1d9a0b65fa2916d8345a473`

The only production-kernel change from eager is an equality check after the existing zero/total guards in `joint_ratio`; it returns `(false, true)` for five equal runs. Real positive row counts sum to their image span, so their existing sum fits `i64`; the shortcut does not calculate `5*r`. Generic invalid overflowing tuples are not an additional contract. Equal `r=0` and `r=1` return `(false, false)` through the existing guards. For equal `r>=2`, the ideal module is `5r/7`; strict centre error is `8r/7`, above its `15r/14` limit by `r/14`, while the loose centre limit is `12r/7`. Outer errors pass both thresholds. All intermediate f64 values are finite and normal, and a conservative `64 * 2^-53 * r` bound on conversion/division/multiplication/subtraction errors is far below `r/14`. The original multiplication grouping and centre-third ordering remain in the fallback.

The added differential test compares both original predicates against the joint result for `r=0..4096`, powers of two and neighbours up to the valid `i64::MAX/5` bound, maximum and neighbours, and 2,048 deterministic large values. Each component is also perturbed by ±1 and ±2; nonnegative values with a checked nonoverflowing sum are compared against the original predicates. The full eager row, shared-cache, work, inverse and thin-centre tests are retained.

M4 verification passed 19 unit, 9 conformance and 11 encoder tests (39 total), using `rustc 1.94.1 (e408947bf 2026-03-25)` with host `x86_64-apple-darwin` and `CARGO_INCREMENTAL=0`. The WASM release used host-text, wasm32-unknown-unknown, `-j 1` and `RUSTFLAGS="--remap-path-prefix=/private/tmp/qr-next-20261116/repo/=. -C strip=symbols"`. Remap the canonical root when reproducing in another checkout. The binary was 221,767 bytes, SHA-256 `a3d464b698cee9d2fbca780bac3fc640a03cb80a6473cffb1b44a8be06d674a6`.

All 89 diagnostic/conformance public results and unchanged input hashes matched the baseline. All 184 photographs retained identical complete results, including 179 correct reads, zero lost reads and zero wrong text. Native Rust tests cover finder lists, callback schedules and Work; the public WASM ABI does not expose Work. See `equal-equivalence.json` and `equal-photos.json`.

Two independent native arm64 Node processes on M4 measured main noise 5.3% faster and six other noise cases 3.9–8.7% faster. Stripes remained 4.7–5.4% slower and checkerboards 5.1–5.2% slower. Clean, blank and gradient were essentially neutral. See `equal-paired1.json` and `equal-paired2.json`. This final variant is rejected; the eager finder-event family is closed without further tuning. No production source, specification, vectors or packaged asset changed.
