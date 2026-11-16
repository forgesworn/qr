# Finder-event density fallback, scratch prototype

Baseline: `f45056c323c28690dea59857e90a53eea3257e4c`. `density.patch` is the complete change from that revision, not an incremental delta. `density-incremental.patch` records only the difference from the frozen eager prototype in `eager.patch`. Both scratch source files and both patches are frozen for review.

SHA-256:

- `rust/src/locate.rs`: `17ecc9cb0eaefbac81dcb40a6457ac5e94dadd62658757cdeeb268a188387738`
- `rust/src/decode.rs`: `e924d3bb6a569ed5d27ac61dd3e59bdf10b6b04f6db20cd01c26da5327b8488d`
- `density.patch`: `8de3cb7dc1f16cb6b1d2611bcddb043d1fe106b4a5302449a7a66bc7cba7b36e`
- `density-incremental.patch`: `5505a6fe3efb99d31a3610e284b080fb53756fa786e11d796e453aa84030c974`

The first 32 raw windows share strict/loose classification. At 16 or more loose-eligible windows the row becomes Direct, its provisional word is discarded, strict scanning continues from the original resume position, and loose uses the original full row. Other rows retain event bits. Allocation is limited to the provisional word until the decision. Cache rows remain image/polarity scoped and store first-edge parity.

Tests were authored for original predicate equivalence, independent callback schedule, boundary lengths 31/32/33, prefix counts 15/16/17, both parities, strict acceptance at ordinal 30/31 with a checked resumption, contrasting prefix/tail densities, zero and Direct row status, repeated loose calls, shared edges with separate inverse caches, full finder/Work and four thin-centre regressions. The deterministic fixture search and all tests passed on M4. The tests assert actual input densities and relevant callbacks, rather than assuming a fixture has the intended properties.

M4 verification passed 20 unit, 9 conformance and 11 encoder tests (40 total), using `rustc 1.94.1 (e408947bf 2026-03-25)` with host `x86_64-apple-darwin` and `CARGO_INCREMENTAL=0`. The WASM release used host-text, wasm32-unknown-unknown, `-j 1` and `RUSTFLAGS="--remap-path-prefix=/private/tmp/qr-next-20261116/repo/=. -C strip=symbols"`. Remap the canonical root when reproducing in another checkout. Binary size was 223,095 bytes; SHA-256 `641bbd889ac1dbc5955d69c3a4858f15bc78e6c1efef299dcda6110e16408d9b`.

All 89 diagnostic/conformance public results matched the baseline. All 184 photographs also matched complete results, retaining 179 correct reads, no lost reads and no wrong text. Expected contents are not retained in the receipt. Two native arm64 Node M4 processes measured main noise 3.9% faster, other noise 2.9–6.4% faster, but stripes 3.6–4.2% slower and checkerboards 3.7–4.5% slower. See `density-paired1.json`, `density-paired2.json`, `density-equivalence.json` and `density-photos.json`.

The fixed majority rule reduced but did not remove the pattern regression. This variant was not integrated. There is no threshold sweep or production acceptance change.

Row metadata is now the `RowEvents` enum, rather than the eager prototype's three-field span: it is likely 16 bytes per row on wasm32 and 32 bytes on a 64-bit native target, subject to the compiler's actual layout. The coordinator can record `size_of::<RowEvents>()` when building; Vec capacity, alignment and allocator overhead are additional.
