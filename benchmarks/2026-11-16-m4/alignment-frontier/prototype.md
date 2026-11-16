# Alignment merge frontier, scratch prototype

Baseline commit `60cf67acd180f0a5968856cb9e0fd2f518d63322`. `prototype.patch` is the full delta from that revision. The scratch `rust/` tree is a pinned snapshot; its `target` symlink points to the checkout's normal target, currently absent and deliberately not recreated. The `vectors` symlink points to the checkout's vector directory. No local compilation, tests or timings were run. The coordinator owns M4 verification. No repository source or packaged binary was changed.

SHA-256:

- `rust/src/place.rs`: `bcf00d37832c357a1f4db5dd4e190e91b52a11028678a0a119f8d6764aaa2175`
- `rust/src/decode.rs`: `d9ef15a50bda1d734ea476bcff0e5eca87973e8f5bdfad050861fb451585e598`
- `prototype.patch`: `fd82aea86fea7cbef3381fe2c99c4670017ac1843828ee8b791eb337d78df9ae`

The original `found` vector, insertion order, x-before-y comparison, weighted centre arithmetic and final score/sort remain unchanged. Ordered active IDs accelerate membership lookup only. On the first vertically accepted observation in a row, an ID is retired only when its y is below `lower = y - ceil(tall)` and `(f.y - lower).abs() > module_size`. A matching distance is inclusive; x alone never retires. An accepted dark run has centre at or above the bound; future rows have nondecreasing bounds. Until a hypothetical first later match, a retired centre cannot change, and the bound rules that match out. Any retained extra ID is safe. The active vector allocates per window as required; capacity and runtime costs are unmeasured.

The independent original full `find_alignments_reference` remains intact. Test-only `locate_reference` keeps the original locate logic and calls that oracle. Added tests compare ordered results and Work over all 65,536 binary 4×4 images for bounded geometries, assert genuine positive scan work and at least one nonempty baseline result, separately cover fractional/zero/negative/NaN/infinite geometry, and retain the existing 1,200 random-window comparisons. A historical full-vector merge oracle checks inclusive boundary retention, upward and downward mean drift, earliest-ID matching and unchanged retired centres under later observations. Full location fields, matrices and Work are compared over size hints and normal/inverse images sharing row edges. Four native thin-centre regressions for pads 4/5 are included. These authored tests are uncompiled and unrun; conformance and public damage fixtures also need coordinator verification.

The authorising diagnostic receipt is retained alongside this file as `receipt.jsonl`, SHA-256 `d5c731f8c248f9c890ea096d35e01825f291451a05b22da51a56d3bbae838491`. Its main noise case records 1,157,797 original membership comparisons, 184,542 active comparisons, 67,224 expiration tests and 40,723 retained moves. The separately counted 1,002,625 scored-duplicate comparisons are untouched. These are work counts, not timing evidence.

## M4 qualification

The frozen prototype passed 17 unit, 9 conformance and 11 encoder tests (37
in total) with Rust 1.94.1, x86_64 compiler host and `CARGO_INCREMENTAL=0`.
The release build used host-text, wasm32-unknown-unknown, `-j 1` and
`RUSTFLAGS="--remap-path-prefix=/private/tmp/qr-next-20261116/repo/=. -C strip=symbols"`.
Its WASM is 212,865 bytes, SHA-256
`aec85e0ab365faca9d7b3577263913af3b14305b2883ae8b4bff6b87b3f9af13`.
All 89 complete ABI results and input hashes matched; all 184 photographic
results matched, retaining 179 correct reads, zero lost reads and zero wrong
text. See `frontier-equivalence.json` and `frontier-photos.json`.

Two native arm64 Node M4 processes measured main noise 2.0–2.1% lower median
latency and the other six noise cases neutral to 2.4% lower. Clean was neutral;
blank was 0.1–0.9% higher, stripes 0.3–1.0% higher, checkerboard 0.1% lower and
gradient within 0.4%. Stripe p95 was 1.8–3.4% higher; the latter fork also had a
higher paired mean. These small pattern changes remain an acceptance concern.
The final readable source was rebuilt and compared separately; see `final.md`
for accepted qualification. This frozen patch and its two receipts remain the
measured prototype.
See `frontier-paired1.json` and `frontier-paired2.json` for all samples and hashes.
