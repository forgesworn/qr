# Invariant finder-leg diagnostic: deferred after screening

The preparing agents performed no local execution; the root agent ran this diagnostic on M4 with native arm64 Node 24.21.0. This observes pinned revision `104b731868c82d00b6f31a9a853db786b2fd971a`. The portable fixture script is adapted from the committed `benchmarks/2026-11-16-m4/budget-dead` 38-case runner; it does not use the fresh 256-case corpus.

Run on the authorised execution host, with TypeScript installed in the repository, using fresh output paths:

```sh
node /path/to/diagnostic/build.cjs /path/to/qr /path/to/new-generated-directory
node /path/to/diagnostic/run.mjs /path/to/qr /path/to/new-generated-directory > /path/to/receipt.jsonl
```

The builder extracts source and PNGs directly from the pinned Git object, independently of the checkout. The runner records source, fixture, tool and frame hashes, checks input bytes before and after each decode, and compares complete results, finder lists and every Work field against a separate baseline. Ordered ray calls are checked against the four expected directed legs, and an ordered trace digest is emitted. Each repeated ray's value is checked with `Object.is` (including NaN and signed zero), as are its pixel count and inner-run stop sequence. Finder-triple construction rays outside the scoped locate/over phases still execute and are counted separately, but are excluded from the reuse opportunity.

Contexts use exact image and triple object identities and verify the finders remain unchanged. The counters distinguish initial geometry, initial weight, retry geometry, retry weight, and `over`'s `estimateSize`; they include in-bounds pixel reads, ray result classes and inner-run stop/state classes. A four-value cache is charged as 32 f64 bytes per triple, cumulative and per active triple; this is not a measurement of an implementation's actual stack layout or setup cost. Initial weight is counted independently from cross-retry work. Early-return phases remain in the accounting. The observer itself executes all original work and is not a performance implementation.

These are TS source-level observations, not Rust instruction counts or timings. LLVM may inline or eliminate repeated computations in one call, and additional cached-value preparation and storage can cost work on first-success paths. The archived compiler-1.96 profile attributes only 0.1865% self time to the named ray closure; inlined work is not identified by that figure. No latency improvement or upper bound is inferred.

SHA-256 provenance:

- builder `cd8da0711aea5e332f475fc5ce25e8cc9481faa44b3cbb7b67e326f0f4c05c4e`
- observer `f65ee01bace7fe263ebd058e6528f3938a6691cc8248ba20fe357bdebd340693`
- runner `7a84b3819a4299af9e4ea37bb980c970970a67be4a156883a14dc6c24e85fe6b`
- pinned `src/locate.ts` `a33c41f2b04532e7c36d87617b9855dcff52a2687912dbc8625297560fdd6d6a`
- pinned `src/decode.ts` `1f3c017da9fba32e448ac5ab21df137e650adce00a4398fe76bf215bcb8f5ebf`
- pinned `test/photo.ts` `d34ab6f88bce5e26342c07a3868577fd73b080379c605e1fd2e8516f85db7bf4`
- pinned `test/png.ts` `b0f276a4c6d667f504ff9f53bf111ebee31f42412299a22bd3a95b6fc6df9e8e`


## M4 result and decision

All 38 cases pass complete result, finder-list, Work and input-byte equality.
The repeated calls also pass ordered directional identity, numeric/NaN/signed-zero
and actual ray-visit/stop comparisons. The implementation remains unchanged.

| Workload | First geometry pixel reads retained | Repeated first-weight reads | Repeated retry reads | Repeated fallback reads | Total repeated pixel reads |
|---|---:|---:|---:|---:|---:|
| Main noise 720p | 1,818 | 1,010 | 7,359 | 808 | 9,177 |
| Additional 720p, seed 49ad7e32 | 1,831 | 693 | 4,930 | 1,138 | 6,761 |
| Additional 720p, seed fe13bc9 | 1,826 | 795 | 5,816 | 1,031 | 7,642 |
| Additional 1080p, seed 49ad7e32 | 1,796 | 673 | 4,655 | 1,123 | 6,451 |
| Additional 1080p, seed fe13bc9 | 1,763 | 708 | 5,596 | 1,055 | 7,359 |
| Clean | 264 | 264 | 0 | 0 | 264 |
| Bent version 12 | 1,391 | 1,391 | 10,833 | 0 | 12,224 |
| Damaged finder, seed 11 | 296 | 296 | 2,368 | 0 | 2,664 |
| Damaged finder, seed 12 | 258 | 258 | 2,064 | 0 | 2,322 |

Main noise enters 31 triples and makes 744 scoped black-white-black calls;
620 repeat identical inputs and values. A separate 872 calls in finder-triple
construction are excluded from this proposal. The high repeated fraction is
not a high share of full-decoder work: the absolute image walks are short.
Four retained f64 values would cost 32 logical bytes per active triple;
actual compiler layout and preparation overhead have not been measured.

The profile's named ray closure has only 0.1865% self time. Outer arithmetic
and inlining prevent treating this as a rigorous ceiling, and LLVM may already
remove some same-call repetition. Combined with the small absolute visit
counts, the evidence does not justify a compiled prototype for the noisy-frame
objective. No runtime gain or regression is claimed.

Exact reuse remains a deferred opportunity for simpler placement code or
specific difficult reads, especially the bent fixture. It is not adopted as a
noise optimisation. No production source, SPEC, vector, budget or search-order
change is made, and no new candidate module is built. This diagnostic did not
access the fresh 256-case corpus.
