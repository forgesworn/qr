1. **[P2] Kotlin enlargement uses different rounding from TypeScript and Rust/WASM.** At [Binarise.kt:236](../../../kotlin/core/src/main/kotlin/dev/forgesworn/qr/Binarise.kt:236), `kotlin.math.round` uses ties-to-even; the compiled bytecode confirms `Math.rint`. [TypeScript:252](../../../src/binarise.ts:252) and [Rust:227](../../../rust/src/binarise.rs:227) round positive halves upwards.

   This occurs at the production enlargement factor: a 2×2 plane containing `[0, 4, 0, 4]`, enlarged fourfold, produces grey `0.5` at destination `(2, 0)`. Kotlin writes `0`; TypeScript/Rust write `1`. The resulting luminance discrepancy can affect thresholding and complete-result parity. Use the same half-up rule across ports, specify ties in SPEC step 22, and add a cross-port interpolation vector. The five passing recovery fixtures do not establish interpolation parity.

No other code findings identified. Earlier successes retain return priority; payload fields survive coordinate scaling; polarity handling and shared terminal budgets appear correct. The receipt verifies complete earlier TypeScript results, unchanged inputs and all 64 negative rejections. Its runner/generated-code hashes and the WASM source/binary hashes match the current files.

Remaining validation gaps:

- **Fresh 224-case validation and all timing acceptance remain pending on the M4.** The 888-case receipt records an M1 run with `fresh: false`; 687 → 696 correct does not finally qualify the change.
- Measure qualifying misses, both luminance bases, earlier successes and established performance controls. Legacy `Work` deliberately excludes terminal recovery, so equal counters cannot establish unchanged latency.
- Verify terminal-path peak memory, repeated WASM memory stability and actual recovery-budget consumption. The new tests only assert legacy counters.
- Extend terminal-path parity checks across rounding ties, polarity/options and recovered metadata beyond the five new frozen frames.

No files modified or benchmarks run. I performed small read-only correctness probes; I did not rerun the reported suites.

