# Fixed-eight scored duplicate blocks: rejected

The diagnostic reduces point visits but the compiled candidate takes more time
on noisy frames. Production retains the original scalar duplicate scan; no
block-size sweep or follow-up variant is included.

## Diagnostic

The portable `diagnostic/` tools pin TypeScript source at `fabe7f2`. All 28
complete results, finder lists, work counts and input hashes agree on M4.
Every duplicate query also retains the exact first matching index. All scored
points remain suppressors, including scores below the final acceptance cutoff.

On the main noisy frame, point visits fall from 1,002,625 to 171,587. Charging
bounds tests, validity guards and extrema updates reduces the apparent saving:
1,036,977 original scalar checks become 861,737 charged operations (16.9% less).
Other noise fixtures reduce that accounting by 18.5–23.6%. Distance evaluations
are unchanged. The model adds up to 1,840 bytes of block metadata in one main
noise context, excluding capacity and allocation. Bent version 12 instead adds
1,849 charged operations; two damaged-finder cases add 380 and 347. These are
rough operation counts, not measured CPU costs. They justified one prototype.

## Frozen candidate and correctness

`prototype.patch` applies to `bd23ee348e9f70fe8365c41ebcd3c54d165741f5` and changes
only `rust/src/place.rs`. `prototype.md` records source and patch identities.
Rust 1.94.1 (`e408947bf`, x86_64 Apple host) passed all 39 native tests with
`--all-features`, using the worktree's existing target and `CARGO_INCREMENTAL=0`.
The two added independent-oracle tests cover append prefixes, full/partial
eight-point blocks, nonfinite inputs, inclusive square/circle boundaries,
earliest matches and low-score suppressors. Existing full-locator reference
and work-count tests also pass.

The host-text WASM is 213,867 bytes, SHA-256
`5354aa43b8e9c3244d7bd2af250185fd6269ff862b89e1683adf9b8acc1b9235`.
It adds 1,002 bytes over the accepted 212,865-byte module, SHA-256
`d41c7e06bd693c51cb4c3f7fbb4df1a79ae6853aa58b2160b1817fb739fc427d`.
All 89 complete ABI comparisons pass. All 184 photograph comparisons preserve
complete results and input hashes, with 179 correct reads, no lost reads and no
wrong text. Their receipts are retained alongside the timings.

An initial build accidentally selected installed Rust 1.96.0 through PATH.
Its timing process was stopped, its measurements discarded, and every check
and timing below rerun after explicitly selecting Rust 1.94.1. Neither the
distributed asset nor its manifest was changed. The retained receipts all
identify the corrected candidate hash above.

## Paired M4 timing decision

Native arm64 Node 24.21.0, Apple M4 Max; two separate serial processes for each
matrix. The existing `scripts/compare-wasm.mjs --negative` uses at least 20
warm-up pairs and one second, then 60 alternating pairs. Complete results and
unchanged input hashes are checked outside timed calls. Raw samples, p95,
module/frame/harness hashes and load are retained in `scored-blocks-paired-*.json`.

| Workload | Baseline median ms, forks 1 / 2 | Candidate median ms, forks 1 / 2 | Change, forks 1 / 2 |
|---|---:|---:|---:|
| Clean | 1.704 / 1.632 | 1.698 / 1.629 | −0.4% / −0.2% |
| Blank | 1.203 / 1.234 | 1.208 / 1.226 | +0.4% / −0.6% |
| Main 720p noise | 20.294 / 20.434 | 20.487 / 20.617 | +1.0% / +0.9% |
| 512×512 noise, seed 49ad7e32 | 14.828 / 14.973 | 15.005 / 15.172 | +1.2% / +1.3% |
| 512×512 noise, seed fe13bc9 | 15.057 / 15.122 | 15.221 / 15.300 | +1.1% / +1.2% |
| 720p noise, seed 49ad7e32 | 16.926 / 17.126 | 17.043 / 17.177 | +0.7% / +0.3% |
| 720p noise, seed fe13bc9 | 17.782 / 17.965 | 17.876 / 18.046 | +0.5% / +0.5% |
| 1080p noise, seed 49ad7e32 | 26.099 / 26.127 | 26.128 / 26.213 | +0.1% / +0.3% |
| 1080p noise, seed fe13bc9 | 28.714 / 28.752 | 28.600 / 28.834 | −0.4% / +0.3% |

Stripes/checkerboard medians vary by at most 0.3%; gradient changes +0.3%/−1.1%.
The explicit supplemental fixtures are greyscale, separate from the RGBA matrix:

| Fixture | Baseline median ms, forks 1 / 2 | Candidate median ms, forks 1 / 2 |
|---|---:|---:|
| Bent version 12 | 4.609 / 4.529 | 4.603 / 4.510 |
| Finder damage, seed 11 | 0.181 / 0.179 | 0.182 / 0.177 |
| Finder damage, seed 12 | 0.185 / 0.185 | 0.185 / 0.183 |

These small supplemental differences do not offset repeatable noise slowdowns.
The fixed-eight implementation is rejected despite correct results and fewer
modelled operations. The fresh 256-case held-out corpus remains unevaluated.

## Reproduction

Follow `diagnostic/README.md` to generate the pinned fixtures. Apply the frozen
patch to its baseline, select the exact compiler explicitly, then build with:

```sh
cd rust
rustup run 1.94.1-x86_64-apple-darwin cargo test --locked --all-features -j 1
RUSTFLAGS="--remap-path-prefix=<canonical-checkout-root>/=. -C strip=symbols" \
  rustup run 1.94.1-x86_64-apple-darwin cargo build --locked --release \
  --features host-text --target wasm32-unknown-unknown -j 1
```

Copy the candidate module outside the checkout; retain the accepted asset.
Use `alignment-row-index/check-candidate.mjs` and `finder-events/check-photos.mjs`
with the repository, generated fixtures and candidate path. Run the existing
paired negative matrix twice. Run `supplement/paired.mjs` twice as described in
`prototype.md`; its corrected argument handling is included in the recorded
harness hash. No prototype binary is distributed.
