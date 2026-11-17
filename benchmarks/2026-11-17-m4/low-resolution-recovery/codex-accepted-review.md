- **[P3] Evidence gap: historical TypeScript timings lack candidate identity.** [previous-paired.mjs:62](../../../benchmarks/2026-11-17-m4/low-resolution-recovery/previous-paired.mjs:62) records runner and fixture hashes but omits candidate JavaScript hashes. Both `final-previous-ts` receipts therefore reproduce the stated numbers without independently binding those runs to the exact final code. The historical WASM receipts and newer TypeScript receipts include candidate identities.

**No correctness findings in the current implementation.** The shared 90-map/one-second-look allowance, quadratic-descriptor exclusion, polarity handling and coordinate scaling match [SPEC step 22](../../../SPEC.md:1456) across all three ports.

The final receipts support 14 fresh gains—112/192 versus 98 baseline and 76 ZXing—plus nine earlier gains, all 96 negative controls rejected, previous successes preserved and 1,112 public-result parity checks. [m4-functional.json:13](../../../benchmarks/2026-11-17-m4/low-resolution-recovery/m4-functional.json:13) records all M4 port suites passing. Current TypeScript emission and WASM/source hashes match the recorded final identities.

Raw timing samples reproduce the summary, including historical terminal-miss changes of **−0.46% to +1.28% TS** and **−1.73% to +0.37% WASM**. The fixed controls show no material repeatable median regression.

**Acknowledged limits remain explicit:** qualifying non-curved misses are substantially slower, and the nine measured new reads cost **70–617% more TS** and **51–1,099% more WASM**. [PERFORMANCE.md:64](../../../PERFORMANCE.md:64) states this trade-off; physical-camera accuracy, mobile/worst-case latency and peak live heap remain unestablished.

No files modified or benchmarks run.