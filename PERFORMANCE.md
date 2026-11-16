# Performance work

Work started from `91dd037` on `perf/overnight-20261115`. The goal is a
measurably faster encoder and scanner without sacrificing correct reads,
port conformance, small downloads or the dependency-free core. No claim of
universal superiority is established by a desktop microbenchmark.

## Delivery and acceptance

- [ ] Reproducible before/after benchmarks: exact source identity, warm-up,
  interleaved timings, typical and slow cases, full decoded results.
- [x] Faster mask selection, with identical matrices and tie-breaking.
- [x] Cheaper failed decoder candidates, preserving recovered reads and work bounds.
- [ ] Optional reusable camera decoder session, tested for changed frames,
  movement, polarity, independent sessions and stale-result rejection.
- [ ] Usable optional browser WASM backend, full-result timing and memory
  lifecycle checks; investigate SIMD only where measurements justify it.
- [ ] Per-photograph accuracy regression gate and independent evaluation.
- [ ] TypeScript, Kotlin, Rust and WASM conformance; package/API documentation.
- [ ] Review final changes, commit, prepare a PR and run hosted checks.

Competitor evaluation must remain outside the package's dependencies. Compare
jsQR, ZXing-C++/WASM, browser-native scanning and relevant encoders with equal
inputs/options. Record unavailable browser/device evidence explicitly. Real
phone timings and a fresh camera corpus cannot be inferred from Node results.

## Execution constraints

Use the existing checkout and Rust target directory; at most two test workers.
No paid services, real payment payloads or maintainer messages. Bound individual
experiments and retain only measured improvements; investigate a failed approach
before repeating it. Keep API changes explicit in SPEC.md. Publication uses the
repository release workflow, never manual npm publishing.

## Current evidence and continuation

- Initial profiling: version-40 mask scoring took about 80% of sampled CPU;
  noisy decoding concentrated in symbol extraction and candidate sampling.
- Initial timing was on a heavily loaded Apple M1, Node 24.21.0. It is diagnostic,
  not release performance evidence.
- Baseline compiled modules are temporarily retained at
  `/tmp/qr-performance-Eoi9WV/baseline`; remove task scratch after recording results.
- Core checks: TypeScript typecheck and 412 tests passed, with the photograph
  cache required (no skipped suites). Native Rust: 24 tests passed. Kotlin:
  full suite passed including 179/184 photographs and no lost baseline reads.
- WASM: all 148 encoder vectors, 58 frames with 464 work counters, and 419
  option comparisons passed unchanged. Memory remained 1,376,256 bytes after
  warm-up through 5,000 rounds; the deliberately leaking control grew.
- Decoder block extraction: the new work regression failed on the baseline
  (29,714 module reads), then passed after incremental extraction. Implemented
  in TypeScript, Rust and Kotlin. No conformance vectors were changed.
- Full-result WASM timing now checks every returned field, including text.
  Character-set differences must be evaluated separately rather than silently
  accepted as equal results.
- Current step: complete the core optimisation checks, then add the optional
  camera session and distributable WASM interface. No physical device results
  or independent competitor ranking have been established.

## Initial before/after measurements

`node scripts/performance.mjs --baseline /tmp/qr-performance-Eoi9WV/baseline`
compares full results before timing, then alternates implementations for 25
rounds after five warm-up rounds. Encoding rounds batch ten operations; decoder
rounds time one complete result. Timings below are medians in milliseconds on
Apple M1, Node 24.21.0. Host load was high (one-minute average 25–28); these are
preliminary paired measurements, not device acceptance or advertising claims.

| Workload | Baseline | Optimised | Speedup |
|---|---:|---:|---:|
| Encode URL | 0.211 | 0.163 | 1.29x |
| Encode mixed text | 0.957 | 0.714 | 1.34x |
| Encode 1,000 digits | 1.929 | 1.497 | 1.29x |
| Encode bytes, version 40 | 6.756 | 4.524 | 1.49x |
| Decode clean RGBA | 8.431 | 8.197 | 1.03x |
| Decode blank RGBA | 10.539 | 10.394 | 1.01x |
| Decode noise RGBA | 186.347 | 114.418 | 1.63x |

Baseline compiled-JavaScript SHA-256:
`03136b587f23b3a08301ea7d6715dca2f1246ec94617a08ca135c8440e677d48`.
Encoder-only optimised build SHA-256:
`db414e0f3735a3daa44c8feeeb07ba4ca42dad24cfdbfff8ffa24445938ba981`.
The benchmark prints build hashes, revision, dirty state, host load and p95
batch timings. Results are scoped to these fixtures; full conformance and
photograph preservation are separate gates.
