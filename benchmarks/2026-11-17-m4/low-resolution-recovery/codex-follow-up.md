The finding is fully resolved. [Binarise.kt:235](../../../kotlin/core/src/main/kotlin/dev/forgesworn/qr/Binarise.kt:235) now uses `floor(value + 0.5)`, matching [SPEC.md:1471](../../../SPEC.md:1471). Fourfold interpolation uses exactly representable binary fractions, so exact ties remain exact.

The [new vector](../../../vectors/conformance.json:1339) exercises `0.5 → 1` and `2.5 → 3`, both of which reject the previous ties-to-even behaviour. All three ports check the shared expected bytes: [TypeScript:389](../../../test/conformance.test.ts:389), [Rust:71](../../../rust/tests/conformance.rs:71), [Kotlin:85](../../../kotlin/core/src/test/kotlin/dev/forgesworn/qr/ConformanceTest.kt:85).

No new correctness issue found in this fix. Review only; no files changed, tests rerun or benchmarks run.