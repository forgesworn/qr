# Rust 1.96.0 qualification with reproducible source paths

Rust source remains unchanged from `bd23ee348e9f70fe8365c41ebcd3c54d165741f5`.
The final compiler update improves clean, blank and gradient frames, reduces
module size and preserves all checked reads. Noise latency is effectively
unchanged. Only the final normalised module below is proposed for delivery;
initial trial receipts remain historical evidence.

## Final identity and the Linux mismatch

| Module | Bytes | SHA-256 |
|---|---:|---|
| Rust 1.94.1 baseline | 212,865 | `d41c7e06bd693c51cb4c3f7fbb4df1a79ae6853aa58b2160b1817fb739fc427d` |
| Initial Rust 1.96.0 M4 trial | 207,272 | `af724c2b9c47a9ad3286cf179e70404236e1bc285f04754a821881219b12d1d6` |
| Final Rust 1.96.0 module | 207,168 | `22ce2eec574d397baced1dada9e14afbaa4a3349f819d3f2af6c788bc8886aec` |

The final module saves 5,697 uncompressed bytes (2.7%). Rust 1.96.0 uses LLVM
22.1.2, versus LLVM 21.1.8 in Rust 1.94.1. Release optimisation, LTO, one codegen
unit, aborting panics and `host-text` remain unchanged. Native tests use the
x86_64 Apple compiler host; WASM timings use native arm64 Node 24.21.0 on M4 Max.

The initial [Linux rebuild failed](https://github.com/forgesworn/qr/actions/runs/43879367868).
A diagnostic revision retained the actual Linux module and
[`linux-b74-mismatch.json`](linux-b74-mismatch.json) from
[run 43881071350](https://github.com/forgesworn/qr/actions/runs/43881071350).
Source hashes matched, but three inlined standard-library panic locations used
local rustup installation paths on M4 and canonical `/rustc/<commit>/library/…`
paths on Linux. The M4 trial was 104 bytes larger. Rust's
[canonical sysroot source-path format](https://rust-lang.github.io/rfcs/3127-trim-paths.html)
provides the common form.

The build now maps the exact compiler sysroot's `lib/rustlib/src/rust/` prefix
to `/rustc/<full-commit>/`, preserving the existing repository remap. It checks
the full compiler commit against the pinned short identity and supplies an
explicit encoded flag array, preserving spaces and replacing inherited plain
or encoded Rust flags. Deliberately invalid incoming flags did not change the
selected build. The resulting M4 module matches the captured Linux module
byte-for-byte. It contains no `/Users/`, `/home/runner/` or local rustlib source
prefixes. The final source hash is
`0cbed56e671163c7233acbfe1074c345b73466bcc7077026e89ea4be61ffa51c`.
The updated manifest passes the unchanged independent Linux rebuild gate in
[CI run 43883912412](https://github.com/forgesworn/qr/actions/runs/43883912412)
at revision `8aca1e4`; its Rust job also passes standalone WASM results, options,
encoding, native/WASM grids and renderings, and repeated-read memory checks.

The verifier now distinguishes binary and provenance mismatches, logs both
identities and the first differing byte, and retains a failed Linux artefact
for one day. Separate negative controls altering expected bytes and metadata
both fail with the appropriate diagnostic. The gate was not relaxed.

Imports, exports and the configured target features match the baseline:
bulk-memory, multivalue, mutable-globals, nontrapping-fptoint, reference-types
and sign-ext. No SIMD or CPU-specific flag is added. Both stripped modules omit
the `target_features` custom section; compiler configuration is not an
independent opcode audit. Chrome 157 verification does not establish older
browser compatibility.

## Final correctness and paired timings

All 37 native Rust tests pass with `--all-features` on the unchanged accepted
Rust source. The final module passes all 89 complete ABI comparisons and all
184 photographic comparisons against the Rust 1.94.1 baseline: 179 correct
reads, zero lost reads and zero wrong text, with unchanged inputs. Actual
packed-package consumer checks pass. Chrome page/worker checks pass all six
character-set cases and tracked-session reset/disposal on this exact module.
`compiler196-final-*.json` contains the final-binary evidence; files without
`final` describe the initial M4 trial.

Two independent Node processes run serially. Each frame has at least 20
alternating warm-up pairs and one second of warm-up, followed by 60 measured
pairs. Complete results and input hashes are checked outside timed calls.
Raw samples, p95, load and harness/module/frame hashes are retained.

| RGBA workload | Baseline median ms, forks 1 / 2 | Final median ms, forks 1 / 2 | Change, forks 1 / 2 |
|---|---:|---:|---:|
| Clean 720p | 1.630 / 1.655 | 1.452 / 1.482 | −11.0% / −10.5% |
| Blank 720p | 1.243 / 1.257 | 1.126 / 1.134 | −9.4% / −9.8% |
| Main 720p noise | 20.492 / 20.735 | 20.469 / 20.782 | −0.1% / +0.2% |
| Stripes | 7.606 / 7.643 | 7.581 / 7.599 | −0.3% / −0.6% |
| Checkerboard | 6.379 / 6.378 | 6.340 / 6.352 | −0.6% / −0.4% |
| Gradient | 4.328 / 4.311 | 3.846 / 3.849 | −11.1% / −10.7% |

Additional noise medians range from 0.4% lower to 0.5% higher. Noise improvement
is not established for the final binary. The initial trial's small noise gain
must not be attributed to the final normalised module.

The separate greyscale supplemental runner at
`../scored-blocks/supplement/paired.mjs` uses the same pairing rules:

| Fixture | Baseline median ms, forks 1 / 2 | Final median ms, forks 1 / 2 | Change, forks 1 / 2 |
|---|---:|---:|---:|
| Bent version 12 | 4.692 / 4.654 | 4.555 / 4.531 | −2.9% / −2.6% |
| Finder damage, seed 11 | 0.179 / 0.183 | 0.167 / 0.171 | −6.6% / −6.6% |
| Finder damage, seed 12 | 0.184 / 0.186 | 0.174 / 0.174 | −5.6% / −6.3% |

Small mixed p95 results remain visible: the second seed-11 damaged-frame p95
changes 0.203→0.206 ms, and one 1080p noise p95 changes 29.666→30.036 ms. The
repeatable benefit is clean/blank/gradient and these supplemental medians,
not every latency percentile or every workload.

## Refreshed pinned-rival comparison

The library runner uses 25 rotating-order rounds after five warm-ups; sessions
use 30 after five. This differs from the stronger paired compiler gate above.
ZXing-WASM 3.1.7, qrcode 1.5.4 and rival/frame hashes match preceding comparisons;
the external lock is `../alignment-frontier/rivals-package-lock.json`.

| Measurement | Final WASM | ZXing-WASM 3.1.7 |
|---|---:|---:|
| Clean 720p, median ms | 1.588 | 2.050 |
| Blank 720p, median ms | 1.189 | 2.149 |
| Main noise, median ms | 21.183 | 7.883 |
| Ten-frame tracked sequence, median total ms | 6.867 | 19.053 |
| Photographs, exact text | 179/184 | 171/184 |
| Development synthetic cases, exact text | 91/96 | 89/96 |
| Regression synthetic cases, exact text and bytes | 172/192 | 169/192 |

Our photograph and regression results have zero wrong reads and zero lost
baseline successes. The photo rival has one text mismatch; this is not a
general false-positive-rate measurement. Noise still takes about 2.69 times
ZXing's time. Differences between older absolute runs do not establish a
compiler gain or regression: the paired final runs above establish the scope.

## Reproduction

Use the existing worktree target and `CARGO_INCREMENTAL=0`. Build/copy the exact
Rust 1.94.1 baseline before changing compiler; then use the final pinned
Rust 1.96.0 build script (`npm run build:wasm`) to apply both path remaps and
produce the final candidate. Keep each module outside the checkout when
comparing it. `compiler196-identity.json` preserves the initial compiler
versions, flags and unchanged Rust-source context; the final manifest is the
current provenance authority.

Run `scripts/compare-wasm.mjs before.wasm after.wasm --negative` twice and the
supplemental runner twice with fixtures generated by
`../scored-blocks/diagnostic/build.cjs`. Complete ABI/photo checks use the
checker commands in the scored-blocks archive. Their baseline asset is pinned
to the saved Rust 1.94.1 module during comparison and restored afterwards.
Browser verification uses the final candidate in `dist/qr.wasm` and closes its
browser, server and profile. The fresh 256-case held-out corpus is untouched.
No physical camera, mobile-energy or universal-superiority claim is made.

The [final-module noise profile](profile/README.md) attributes about 45% of
sampled self time to finder scanning, cross-checks and row edges, and about
31% to placement and alignment scoring. It identifies the next investigation
areas; it establishes no further performance gain.
