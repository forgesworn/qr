# Finder ratio order: diagnostic only

Pinned revision `bd23ee348e9f70fe8365c41ebcd3c54d165741f5`. Prior project evidence rejects lookup-table and integer-arithmetic finder ratios after full-frame measurement. The archived eager, density and equal-run event variants keep centre third and were rejected; this diagnostic does not revisit them. It examines exactly one alternative, predicate order `2,0,1,3,4`, compared with original `0,1,2,3,4`.

```sh
node /path/to/diagnostic/build.cjs /path/to/qr /tmp/ratio-generated
node /path/to/diagnostic/run.mjs /path/to/qr /tmp/ratio-generated > /tmp/ratio-receipt.jsonl
```

The builder reads pinned sources, fixture helpers and seven conformance PNGs from Git; the explicit repo provides its installed TypeScript compiler. The runner retains the 28 approved frontier fixtures, including all four thin-centre cases, and excludes the fresh 256-case corpus. Its fixture generator derives from `benchmarks/2026-11-16-m4/alignment-frontier/run.mjs` at the pinned revision (SHA-256 `0479ec0449dbd230223fa890f0ca36b3d7a9e05ddaf9df07502d7b4e5fc10efc`). Each frame is hashed before and after each decoder. Full results, finder lists and every Work field are compared. A streaming digest and count independently compare every original row window's k, y, end, copied counts, ratio result, consider result and next k. The original ratio predicate controls all decoding, skips and candidates.

At every actual scalar ratio call, the observer simulates both fixed orders after the same short-circuit zero checks, four-add total, total guard, division and slack calculation. It asserts both booleans equal the actual original result. It groups counts by row, vertical, horizontal and diagonal stage and the exact original tolerance. Each visited component records count load, modelled numeric conversion, subtraction, abs and comparison; the centre also costs two multiplications for `3 * module` and `3 * slack`, in precisely that grouping. JavaScript numbers are already floating point; conversions model corresponding integer-count-to-f64 operations, rather than claiming JS performs them. Guard checks, arithmetic and comparisons remain separate. Rejection histograms record the first failed component or guard for each fixed order.

The five-bit truth-mask histogram performs extra independent diagnostic-only evaluation of all five predicates after passing guards. Its work is excluded from hypothetical order counts; it does not propose additional permutations. Digest equality establishes matching recorded traces subject to SHA-256 collision limits, while finder/result/work equality is directly checked. Operation counts omit real compiler, dispatch and runtime effects and carry no timing or speed claim. No observer elapsed time is a benchmark.

Pinned sorted TypeScript filename-plus-bytes SHA-256 `f0ab875c24cd74649a8e3635528f885e920567da8522649c05ed123f3da1ef01`; `src/locate.ts` `a33c41f2b04532e7c36d87617b9855dcff52a2687912dbc8625297560fdd6d6a`; `test/photo.ts` `d34ab6f88bce5e26342c07a3868577fd73b080379c605e1fd2e8516f85db7bf4`; `test/png.ts` `b0f276a4c6d667f504ff9f53bf111ebee31f42412299a22bd3a95b6fc6df9e8e`.

Tool SHA-256: `build.cjs` `090a74fd46a55b4c91dfbb908803a337277b434b3176425cc4bdf58cecba45c9`; `observer.mjs` `8c2e268ea429377ed370d62fdedd45df3241d14e0160612026960db788276e31`; `run.mjs` `fbe4972309afad88adbc85e58e17bf550849ad66c537e700021abb6a121c43be`.

No local build, transpilation, decoder invocation, test or timing has been run. Root schedules execution and decides whether any further work is justified.

## M4 result: rejected before a compiled prototype

Root subsequently ran these exact tools on M4. All 28 callback trace, complete
result, finder-list, work-count and input-preservation comparisons passed.
The proposed order is rejected on its arithmetic accounting; no production
change, compiled prototype, permutation search or timing claim follows.

| Fixture | Original predicates | Centre-first predicates | Original centre multiplications | Centre-first centre multiplications | Charged operation change |
|---|---:|---:|---:|---:|---:|
| Main 720p noise | 1,132,042 | 1,116,782 | 357,556 | 893,428 | +3.86% |
| 640×360 noise, seed 5 | 758,656 | 770,501 | 244,800 | 569,084 | +4.92% |
| 640×360 noise, seed 42 | 761,655 | 773,793 | 245,656 | 570,782 | +4.93% |
| Clean | 1,512 | 1,302 | 540 | 1,080 | −3.50% |
| Stripes | 860,940 | 735,210 | 361,710 | 498,780 | −6.42% |
| Bent version 12 | 44,131 | 43,554 | 14,802 | 32,800 | +3.50% |

The charged sum includes zero checks, additions, total guard, division, slack
multiplication, count loads, modelled conversions, subtractions, abs,
comparisons and centre multiplications. It excludes truth-mask diagnostics and
bookkeeping. These operations are not equal CPU costs, so the sum is a screening
heuristic rather than a performance estimate. Main-noise strict row calls add
0.31% charged operations and loose row calls add 8.49%; the additional centre
multiplications remove the apparent benefit from slightly fewer predicates.
Other damaged, small and rotated fixtures mostly also add charged operations.
The complete per-stage/tolerance counters remain in `receipt.jsonl`. The fresh
256-case held-out corpus remains unevaluated.
