# Finder event accounting

Read-only diagnostic pinned to `f45056c323c28690dea59857e90a53eea3257e4c`. The SHA-256 of sorted `snapshot/src/*.ts` filename followed immediately by file bytes is `f0ab875c24cd74649a8e3635528f885e920567da8522649c05ed123f3da1ef01`. It uses 28 approved synthetic/conformance/damage cases, including four thin-centre examples; it does not access the fresh held-out corpus. The baseline and observed decoders produce identical complete results, finder lists and Work on every case.

```
node build.cjs /path/to/qr /tmp/finder-events-generated
node run.mjs /path/to/qr /tmp/finder-events-generated > /tmp/finder-events-receipt.jsonl
```

The observer derives strict and loose eligibility for each row's complete five-run windows. It records the real callback outcomes and independently replays eligible windows with the original two- or six-edge advance. It asserts every candidate position, five counts, row, end, predicate and callback result, including missing/extra candidates. The replay uses event values but does not implement or test a next-set-bit representation.

`actual.*.comparisons` counts the original predicate's abs calculations and threshold comparisons; they are equal there. `actual.*.totals` and `divisions` distinguish totals from `total < 7` early returns. `jointAbs` and `jointThresholds` simulate one-pass shared errors: compare loose first, then strict while strict remains possible. The centre term is third and uses `3 * (module * tolerance)`. `jointComparisons` instead models a loose predicate followed by an independent strict predicate only on loose survivors; it counts threshold comparisons, not shared abs work. Neither model captures actual iteration, allocation or compiler costs. The coordinator separately checked one-pass predicate truth against original predicates for all 59,049 tuples in 0..8, including zero and short-total cases.

The lazy model retains strict-positive events and builds loose events only when a loose row is actually reached; negatives and unseen windows require loose evaluation. `knownStrictPositive` is the number of previously tested strict-positive windows in reached loose rows, and `knownLooseComparisons` is the corresponding loose checks avoided if these are reused. This accounting assumes free tracking and lookup; actual storage and lookup costs remain to be measured. `eventBytes` is an ideal two-bit packed payload rounded up per image/row; `strictPositiveBytes` and `lazyLooseBytes` are ideal one-bit payloads. `rowMetadata` counts rows, not bytes. For an illustrative eight bytes per row, multiply by `rowMetadata`; flags, alignment, allocators and per-polarity lifetime would add more. Values are cumulative across separate images/polarities, not peak retained memory.

Authoritative receipt: `receipt-authoritative.jsonl`, SHA-256 `7a1e5c4ac7acd1ed33bcc274c8d990264edec2e52bb59473dffc63794f2473ec`. `build.cjs` SHA-256 `0ac1fc03a2b4bced6156784ddcdb6620646cb42d676e47bd48fc8c68dbd78638`; `observer.mjs` `fe00914cdfe6a0e2cfe8502930ecc51c73368eea995a76b27e418781639a33ba`; `run.mjs` `84b17e4bad9d5053c93a57f3aa634b5a999cfecc137a5d847ad93d7c3afca797`. Earlier receipt files are superseded intermediate accounting and should not be used as the final operation counts.

For main 1280×720 seed 5 (frame SHA-256 `7b6261f2cb3c1228f414adf9602b36c6a8763d020f2e4ab564e386e1d1dae00c`), actual strict/loose ratio calls are 301,596/171,770. Their combined 1,047,289 abs operations and threshold comparisons and 421,531 divisions compare to the eager one-pass model's 827,437 abs, 1,260,552 threshold comparisons and 268,789 divisions. The main clean frame SHA-256 is `0afcbadee3f95e050a73df547f4e61d973e8085109b0f3f48c901333942e0b22`; it finishes in the strict pass and has 1,089 original comparisons versus 1,608 joint abs and 2,535 joint threshold comparisons. Every case's frame SHA-256 and complete counters appear in the authoritative receipt.

The simplification subsequently implemented in the scratch prototypes below: consume strict results immediately as raw windows are classified, retaining only loose bits. Apply the original resume-edge guard on every raw event; strict-skipped windows still need classification for a later loose pass. On the main 720p frame this would use an ideal 38,469 packed bytes plus 1,740 row records (13,920 bytes at an illustrative 8 bytes each). It reconstructs lengths for the 28,639 loose survivors, so raw five-length derivations are 301,761 + 28,639 = 330,400, compared with 473,366 original calls, assuming no further recomputation. It still incurs guards, bit scanning, reconstruction and metadata costs. These operation counts alone do not establish a runtime saving; paired prototype measurements appear below.

The 38,469-byte figure rounds each row to bytes. Packing into `u32` words could add up to 3 bytes per row, up to 5,220 bytes across the 1,740 rows, in addition to the illustrative metadata and other overhead. Any proposed cache must be scoped to one search image and polarity: shared edge positions between normal and inverse images do not make their eligibility bits interchangeable.

## Paired M4 prototypes

The prototypes preserve exact eligibility, callback order and work accounting;
none introduces a new finder acceptance threshold. All use the same accepted
212,269-byte baseline WASM (`33a95f2de8d70d61eeef76b8c23eb251e1f748d15f43fa30e6ff90546f983115`).
The committed `scripts/compare-wasm.mjs` runner was invoked in two independent processes,
each with at least 20 warm-up pairs and one second of warm-up, then 60 alternating
pairs per workload. Complete result and unchanged-input checks sit outside each
timed decode. Receipts retain every sample, median, p95 and source/workload hash.
These comparisons are against our baseline, not a fresh ZXing measurement.

| Variant | Main noise latency | Other six noise cases | Stripes | Checkerboard | Decision |
|---|---:|---:|---:|---:|---|
| Eager shared classification | 5.0–5.1% lower | 3.7–8.5% lower | 6.0–6.2% higher | 7.6–7.8% higher | Not integrated |
| Fixed majority density fallback | 3.9% lower | 2.9–6.4% lower | 3.6–4.2% higher | 3.7–4.5% higher | Not integrated; no threshold sweep |
| Eager with exact equal-run shortcut | 5.3% lower | 3.9–8.7% lower | 4.7–5.4% higher | 5.1–5.2% higher | Rejected; family closed |

Clean and blank results were essentially neutral. Full patches, build identities,
verification details and receipts are in [eager.md](eager.md) and
[density.md](density.md). Both passed 89 complete public-result comparisons.
The density variant additionally preserved all 184 photographic results,
including 179 correct reads, no lost reads and no wrong reads. Native Rust tests
ran with the pinned x86_64 compiler on M4; timing ran in native arm64 Node.

The final bounded variant adds an exact equal-run shortcut to the original eager
classifier, without the density fallback. Its proof and differential-test inputs
and completed M4 qualification are in [equal.md](equal.md). It passed 39 native
tests, 89 complete public-result checks and all 184 photographic comparisons,
but retained the pattern slowdown. No further cache variants are planned. The fresh held-out corpus
has not been evaluated for these execution-only changes.
