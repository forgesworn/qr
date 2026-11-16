# Rust 1.96.0 compiler-only qualification

The accepted Rust source at `bd23ee348e9f70fe8365c41ebcd3c54d165741f5` is
unchanged. This experiment changes the compiler from Rust 1.94.1 / LLVM 21.1.8
to Rust 1.96.0 / LLVM 22.1.2, retaining release optimisation, LTO, one codegen
unit, aborting panics, `host-text`, path remapping and stripped symbols.
It does not include the rejected fixed-eight duplicate-lookup prototype.

## Identity and compatibility

`compiler196-identity.json` records the clean baseline source identity, exact
compiler commits, hosts, LLVM versions, enabled target features, imports and
exports. M4 already had Rust 1.96.0 under `stable-x86_64-apple-darwin`; the trial
explicitly selected that installed toolchain and asserted its exact compiler
version. It did not update the host toolchain. Native tests use the x86_64
compiler host; WASM measurements use native arm64 Node 24.21.0 on M4 Max.

| Module | Bytes | SHA-256 |
|---|---:|---|
| Rust 1.94.1 baseline | 212,865 | `d41c7e06bd693c51cb4c3f7fbb4df1a79ae6853aa58b2160b1817fb739fc427d` |
| Rust 1.96.0 candidate | 207,272 | `af724c2b9c47a9ad3286cf179e70404236e1bc285f04754a821881219b12d1d6` |

This saves 5,593 uncompressed bytes (2.6%). Imports and exports match exactly.
Both compilers select bulk-memory, multivalue, mutable-globals,
nontrapping-fptoint, reference-types and sign-ext. No SIMD or CPU-specific flag
is added. Both stripped modules omit the `target_features` custom section;
matching compiler configuration is not an independent opcode-feature audit.
Chrome 157 page/worker tests pass on the exact candidate, including all six
character-set cases and tracked-session reset/disposal. This is not an older
browser compatibility test.

All 37 native Rust tests pass with `--all-features`. All 89 complete ABI
comparisons and all 184 photographic comparisons agree with the baseline;
photographs retain 179 correct reads, zero lost reads and zero wrong text.
Inputs remain unchanged. The normal `scripts/build-wasm.mjs --write` build,
after updating the compiler pin, reproduces the timed candidate byte-for-byte.
The final provenance source hash is
`9084f5024385558134f9ddab26f74ad2ccdd59887876640815e15d9ddcf445ec`;
it differs from the trial's baseline hash because `scripts/wasm-source.mjs` is
part of the provenance input. The actual packed package consumer checks pass.

## Paired timing

Two independent native Node processes run serially with at least 20 alternating
warm-up pairs and one second of warm-up, followed by 60 measured pairs per
frame. Complete results and unchanged input hashes are checked outside timed
calls. Raw samples, p95, load and harness/module/frame hashes are retained in
`compiler196-paired-1.json` and `compiler196-paired-2.json`.

| RGBA workload | Baseline median ms, forks 1 / 2 | Candidate median ms, forks 1 / 2 | Change, forks 1 / 2 |
|---|---:|---:|---:|
| Clean 720p | 1.574 / 1.609 | 1.431 / 1.457 | −9.1% / −9.5% |
| Blank 720p | 1.210 / 1.207 | 1.091 / 1.107 | −9.9% / −8.3% |
| Main 720p noise | 19.915 / 20.357 | 19.804 / 20.264 | −0.6% / −0.5% |
| Stripes | 7.572 / 7.553 | 7.504 / 7.536 | −0.9% / −0.2% |
| Checkerboard | 6.313 / 6.295 | 6.272 / 6.285 | −0.6% / −0.2% |
| Gradient | 4.174 / 4.173 | 3.760 / 3.732 | −9.9% / −10.6% |

Five additional noise cases improve in both forks, by 0.1–1.3%. The remaining
512×512 seed-49ad7e32 case changes −0.1%/+0.4%, effectively neutral. These are
small noise gains; the larger repeatable benefits are clean, blank and gradient
frames. Main-noise p95 improves slightly in both forks.

The separate greyscale supplemental runner is retained at
`../scored-blocks/supplement/paired.mjs`, with its hashes in each receipt. It uses
the same warm-up and alternating-pair rules and validates expected text/bytes
and complete results outside timing:

| Fixture | Baseline median ms, forks 1 / 2 | Candidate median ms, forks 1 / 2 | Change, forks 1 / 2 |
|---|---:|---:|---:|
| Bent version 12 | 4.513 / 4.513 | 4.410 / 4.370 | −2.3% / −3.2% |
| Finder damage, seed 11 | 0.173 / 0.173 | 0.164 / 0.163 | −5.4% / −5.7% |
| Finder damage, seed 12 | 0.182 / 0.183 | 0.174 / 0.172 | −4.4% / −5.8% |

One seed-12 damaged-frame p95 rises from 0.220 to 0.243 ms; the second fork
falls from 0.192 to 0.184 ms. The mixed tail result is retained rather than
claiming every latency percentile improves.

## Reproduction and scope

Use the exact accepted source, one existing worktree target directory and
`CARGO_INCREMENTAL=0`. Build each compiler separately with the same flags:

```sh
cd rust
rustup run <exact-toolchain> cargo test --locked --all-features -j 1
RUSTFLAGS="--remap-path-prefix=<canonical-checkout-root>/=. -C strip=symbols" \
  rustup run <exact-toolchain> cargo build --locked --release --features host-text \
  --target wasm32-unknown-unknown -j 1
```

Copy each module outside the checkout before rebuilding. Use the existing
`scripts/compare-wasm.mjs before.wasm after.wasm --negative` twice; use the
supplemental runner twice with the pinned fixtures generated by
`../scored-blocks/diagnostic/build.cjs`. The complete ABI/photo checker commands
are documented in the scored-blocks archive. Browser verification uses the
candidate at `dist/qr.wasm`, restores the accepted asset afterwards, and closes
its browser/server/profile.

Direct pinned-ZXing comparison receipts are retained separately from the paired
compiler experiment. Differences between older and refreshed absolute timings
do not measure the compiler's contribution. The fresh 256-case held-out corpus
remains unevaluated; no physical camera or energy claim is made.

The refreshed library runner uses 25 rotating-order rounds after five warm-ups;
the session runner uses 30 after five warm-ups. These are different protocols
from the paired compiler gate above. ZXing-WASM 3.1.7, qrcode 1.5.4, rival binary
and frame hashes match the preceding comparison; the external dependency lock
is retained at `../alignment-frontier/rivals-package-lock.json`.

| Measurement | Current WASM | ZXing-WASM 3.1.7 |
|---|---:|---:|
| Clean 720p, median ms | 1.511 | 1.936 |
| Blank 720p, median ms | 1.143 | 2.084 |
| Main noise, median ms | 20.192 | 7.536 |
| Ten-frame tracked sequence, median total ms | 6.752 | 18.511 |
| Photographs, exact text | 179/184 | 171/184 |
| Development synthetic cases, exact text | 91/96 | 89/96 |
| Regression synthetic cases, exact text and bytes | 172/192 | 169/192 |

Our photograph and regression comparisons have zero wrong results and zero
lost baseline reads. The photo rival has one text mismatch; this is not a
general false-positive-rate measurement. The 192-case runner compares against
the accepted `bd23` module and unchanged TypeScript build, with their hashes
recorded. The noise result remains about 2.68 times ZXing's latency.
