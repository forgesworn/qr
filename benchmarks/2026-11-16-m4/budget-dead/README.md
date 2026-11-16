# Budget-dead phase observer

Pinned revision `8aca1e4d3ca6756553dbea93432866d4d02d5f7b`. TypeScript and Rust both evaluate finders, triples and locations before checking `maps`/`here` in the innermost location loop, and both enter inverse search after a normal search without an intervening budget guard. This observer instruments the pinned TypeScript control flow; its work counts are diagnostic proxies, not measured native Rust or WASM time. It never changes the search budget, skips a phase, alters a candidate or changes Work.

```sh
node /path/to/diagnostic/build.cjs /path/to/qr /tmp/budget-generated
node /path/to/diagnostic/run.mjs /path/to/qr /tmp/budget-generated > /tmp/budget-receipt.jsonl
```

Both arguments are required. The builder copies source, fixture helpers and seven PNGs from pinned Git and transpiles baseline and observed copies using the repository's installed TypeScript compiler. The runner derives from the committed 28-case alignment-frontier harness and adds the existing six negative seed/size frames, three negative patterns and a blank frame. The suite includes main 720p noise, clean, known bent/damaged cases and all four thin-centre regressions; it never uses the fresh 256-case corpus. Baseline and observed complete results, finder lists and all Work fields are compared for each case; the input frame hash is checked before and after both decodes.

Search, finder collection, triple generation, each ranked triple and every initial or retry locate are grouped by actual entry budget and its reason: `live`, `global`, `perLook` or `both`. Metadata records ordinary image inversion, scale factor, strict mode, inverted-luminance fallback (`strictOverride`), tolerance and retry delta as applicable. A phase is dead only if its own entry has `maps === 0 || here === 0`; a phase entering live is never charged wholly dead merely because later maps go unused. Entry budget histograms retain exact `maps/here` values. Returned item counts are emitted for finder/triple/locate arrays; returned readings are separately counted for search.

Scoped Work deltas include cross-check steps and alignment-window `scanned` area. Row windows count actual five-run windows visited by the finder loop, including skips. New edge rows and the `width - 1` adjacent pixel comparisons they represent are charged on edge-cache misses to every enclosing observed phase. Counts in nested search/finder/locate phases overlap and must not be summed together; row/edge counters outside any observed phase are not attributed. Per-scale and per-polarity groups allow isolation of reduced `here` exhaustion from full-size/global exhaustion. Other uninstrumented processing is not charged.

Dead-search groups include candidate queue length histograms at entry and return. The `secondAfterDeadSearch` section records later second-look attempts and distinct candidate queues, including queue lengths and dead reasons, to preserve visibility of the recovery queue; it does not claim these second looks can be skipped. Queue lengths and second-look counts describe actual unchanged execution, not a simulated early return. Work remains contractual; any future removal needs separate behaviour/SPEC/vector consideration. Observer elapsed time and these counts are not a performance claim.

Source-directory SHA-256 (sorted `.ts` filenames followed by bytes): `f0ab875c24cd74649a8e3635528f885e920567da8522649c05ed123f3da1ef01`. `src/decode.ts` `c8c6e1db2ecac8283cc98ce90a4a3a0b8fa753d8c68c4b208eeb4a97a760316c`; `src/locate.ts` `a33c41f2b04532e7c36d87617b9855dcff52a2687912dbc8625297560fdd6d6a`; `rust/src/decode.rs` `25637752984a9c8b370fcd6c963b87a65aa22cfa3b76efbead56885180138903`; `test/photo.ts` `d34ab6f88bce5e26342c07a3868577fd73b080379c605e1fd2e8516f85db7bf4`; `test/png.ts` `b0f276a4c6d667f504ff9f53bf111ebee31f42412299a22bd3a95b6fc6df9e8e`; original committed fixture runner `0479ec0449dbd230223fa890f0ca36b3d7a9e05ddaf9df07502d7b4e5fc10efc`.

Tool SHA-256: `build.cjs` `2fe4944eabb1c7081c2d97d554f3b10035f067e341b3229c4f8f25885e421f41`; `observer.mjs` `5393a2ce49c61bc2e29c5ac0eb5920ff4f8d0fcce7ca32755d9e27af5b533319`; `run.mjs` `40c0e6204203e303889f9708bd9d4f9b678d16cab22f88695f11065a0b4a4c20`.

## M4 diagnostic result

The root agent ran the frozen builder and observer serially on M4. All 38
fixtures passed complete result, finder-list, Work and input equality. No
production optimisation or timing gain is established by this observer.

The table sums only non-overlapping finder/triple/locate phase counters,
excluding enclosing search totals. Fractions are work already entered with
zero maps or zero per-look allowance:

| Noise frame | Dead finder windows | Dead cross-check steps | Dead alignment area |
|---|---:|---:|---:|
| Main 1280×720 | 16.5% | 9.0% | 4.6% |
| Additional 1280×720 seed 49ad7e32 | 18.8% | 13.4% | 6.4% |
| Additional 1280×720 seed fe13bc9 | 18.9% | 13.7% | 6.3% |
| 512×512 seeds | 12.1% | 7.3–7.7% | 0.8–1.4% |
| 1920×1080 seeds | 11.9–12.3% | 6.4–6.9% | 4.3–4.7% |

Main-noise full-resolution phases have no dead work; the reduced-size
allowances account for all of it. No dead work was observed on clean,
bent/damaged, thin-centre or patterned fixtures. These work fractions are
not elapsed-time savings, and each denominator measures a different activity.

The second-look queue counter records no attempts following a search entered
already exhausted in this suite. It does not cover every search that enters
live and exhausts internally, so it cannot justify removing queued second
looks. Any implementation must preserve those and subsequent size allowance
resets; targeted recovery tests remain required.


## Accepted two-guard candidate

The Rust prototype adds an entry guard and returns after an unsuccessful final
map read when either allowance is exhausted. It retains successful-read
precedence and the existing pre-read guard. It does not return early from
`look`, change inverse allocation, lower allowances, discard queued candidates
or change size resets. TypeScript and Kotlin receive the same guards; SPEC
records the changed work accounting. `prototype.patch` and `ports.patch` apply
to `8aca1e4`; the accepted Rust layout is the measured one.

All three new native tests pass: each exhausted entry preserves a sentinel
queue/buffer/budget/Work, a final available map can succeed, and actual bent
version-12 second-look recovery survives global, per-look and combined
exhaustion. Original search/look copies are test-only differential oracles.
All 89 public ABI comparisons and 184 photograph comparisons preserve complete
results and inputs (179 correct, zero lost or wrong).

The original conformance test first failed its historical Work assertion, as
expected. A separate diagnostic retained all result/location checks, required
identical map/recovery counters and nonincreasing search work across all 61
frames. Only `decode-frames/frame-39.png` changed: steps 103918→94013,
comparisons 91→88 and alignment area 1583390→1535363; all other recorded values
are unchanged. `work-differences.json` records this. The shared vector was
regenerated with `QR_WRITE_CONFORMANCE=1 npx vitest run test/conformance.test.ts`,
not edited by hand. The subsequent unmodified conformance gate passes.

The exact timed and packaged module is 207,214 bytes, SHA-256
`1b03677a443be96a4ebd73510b675e86fb8cdd668303d1d0355639160970343f`,
46 bytes larger than accepted `22ce`. The unchanged pinned Rust 1.96.0 build
with both path remaps reproduces that candidate byte-for-byte.

## Paired M4 decision

Two independent serial native-arm64 Node 24.21.0 processes use at least 20
warmup pairs and one second, then 60 alternating pairs. Complete results and
input hashes are compared outside timing. Lower median times are better.

| RGBA workload | Before ms, forks 1 / 2 | After ms, forks 1 / 2 | Change, forks 1 / 2 |
|---|---:|---:|---:|
| Clean 720p | 1.495 / 1.515 | 1.481 / 1.511 | −0.9% / −0.2% |
| Blank 720p | 1.135 / 1.159 | 1.134 / 1.163 | −0.1% / +0.3% |
| Main noise 720p | 21.020 / 21.094 | 19.585 / 19.510 | −6.8% / −7.5% |
| Noise 512², seed 49ad7e32 | 15.449 / 15.669 | 14.935 / 14.972 | −3.3% / −4.4% |
| Noise 512², seed fe13bc9 | 15.602 / 15.784 | 15.000 / 15.155 | −3.9% / −4.0% |
| Noise 720p, seed 49ad7e32 | 17.587 / 17.579 | 16.012 / 15.986 | −9.0% / −9.1% |
| Noise 720p, seed fe13bc9 | 18.433 / 18.456 | 16.281 / 16.229 | −11.7% / −12.1% |
| Noise 1080p, seed 49ad7e32 | 26.896 / 27.085 | 25.064 / 25.194 | −6.8% / −7.0% |
| Noise 1080p, seed fe13bc9 | 29.343 / 29.662 | 27.295 / 27.381 | −7.0% / −7.7% |

All seven noise p95 results improve in both forks. Stripes/checkerboard/gradient
medians remain within 0.8% of baseline. Greyscale supplemental medians are
mixed: bent12 −0.16%/+0.47%, damaged seed11 −1.37%/+1.39%, and damaged seed12
−0.61%/+0.53%. Small mixed tails remain recorded; seed12 p95 changes
0.220→0.194 ms in one fork and 0.204→0.214 ms in the other. These do not show
a repeatable regression. The observed noise benefit justifies integration;
this remains far short of closing the whole ZXing noise gap.

## Integrated ports and refreshed rival comparison

With the officially regenerated vector, M4 passes all 462 JavaScript tests
with photographs required, all 40 standard Rust tests with all features, and
all 118 Kotlin tests with zero skips, failures or errors. The temporary Work
diagnostic also ran nine tests and was then removed from the checkout. Packed
consumer checks and Chrome 157 page/worker, six character-set cases and tracked
session reset/disposal pass on the exact final module. The strict independent
Linux rebuild remains a required CI gate for this revision.

The new Kotlin jar is separately compared with the accepted frontier jar in
two serial Java 21.0.11 aarch64 forks, 200 warmup pairs and at least two seconds
per fixture, followed by 60 measured pairs. Complete results are checked outside
timing/allocation brackets. Jar/source/test identities are in
`budget-dead-qualification.json`; these JVM greyscale results are not WASM RGBA
or ZXing Java measurements.

| Kotlin workload | Baseline ms, forks 1 / 2 | Guarded ms, forks 1 / 2 | Change |
|---|---:|---:|---:|
| Clean | 1.072 / 1.080 | 1.072 / 1.069 | 0.0% / −1.0% |
| Noise 720p | 42.182 / 42.876 | 40.545 / 40.538 | −3.9% / −5.5% |
| Noise 512² | 33.462 / 33.791 | 33.074 / 33.260 | −1.2% / −1.6% |
| Noise 1080p | 49.514 / 49.879 | 47.126 / 47.597 | −4.8% / −4.6% |
| Stripes | 7.643 / 7.538 | 7.767 / 7.529 | +1.6% / −0.1% |
| Checkerboard | 6.261 / 6.213 | 6.326 / 6.266 | +1.0% / +0.9% |

The Kotlin checkerboard cost is a small repeatable tradeoff (0.053–0.065 ms),
not a no-regression result. Checkerboard p95 increases 0.081–0.131 ms; stripe
medians are mixed but p95 increases 0.105–0.441 ms. Blank medians remain within
0.4%. Noise savings are
larger and repeatable; individual pattern tails remain in the raw receipts.

Fresh direct comparisons use the same pinned rival/frame identities as the
previous qualification, 25 rotating rounds after five warmups (sessions: 30
after five). Different-run absolute timing changes do not measure the guard's
gain; the paired comparisons above establish that scope.

| Measurement | Our final WASM | ZXing-WASM 3.1.7 |
|---|---:|---:|
| Clean 720p median ms | 1.605 | 2.112 |
| Blank 720p median ms | 1.192 | 2.169 |
| Main noise median ms | 19.975 | 7.872 |
| Ten-frame tracked sequence median total ms | 6.844 | 19.203 |
| Photographs, exact text | 179/184 | 171/184 |
| Development synthetic cases | 91/96 | 89/96 |
| Regression synthetic cases, exact text/bytes | 172/192 | 169/192 |

Our photo/regression results have zero wrong reads and no lost baseline reads.
The photo rival has one text mismatch; this is not a false-positive-rate study.
Noise still takes about 2.54 times ZXing's time. TypeScript alone measures
4.538 ms clean and 54.842 ms noise in this direct run. The fresh 256-case corpus
remains untouched; no physical camera, battery or universal-superiority claim
is made.
