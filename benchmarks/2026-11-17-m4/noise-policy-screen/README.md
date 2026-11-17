# Noise-rejection policy screen: rejected

Baseline: the low-resolution candidate, commit `e1e860b`. The runs used its
working tree before that commit, so receipts record revision `85aec98`; the
decoder sources were identical, and only four review notes changed at commit
time, to use relative paths. On the fixed
1280 x 720 noise frame its packaged WASM takes 19.5–19.9 ms in this session's
paired runs, against ZXing-WASM 3.1.7's 7.7 ms in the candidate's direct
comparison. The screen looked for search policies that cut work on frames
holding no symbol without losing any read. None qualified, so no source,
SPEC, vector or WASM change follows from it.

## Where noise time goes

| Profile of the main noise frame | Share of sampled time |
| --- | ---: |
| TypeScript, 200 decodes: location, including alignment search | 40.6% |
| TypeScript: reading sampled grids, including Reed–Solomon 5.7% | 22.0% |
| TypeScript: finder search, including cross-checks 6.7% | 21.5% |
| TypeScript: luminance, thresholds and binarisation | about 11% |
| WASM with names, 400 decodes: finder search (row scan 22.3% self, cross-checks 11.2%, row edges 8.2%) | 39.0% |
| WASM: location (alignment scoring 6.8%) | 35.2% |
| WASM: reading sampled grids (Reed–Solomon 6.5%) | 11.6% |
| WASM: luminance, thresholds, binarisation and reductions | about 12% |

A stage trace of the TypeScript decoder attributes 34.8 of 47.3 ms to the
full-size pass, 8.9 ms to the three reduced sizes and 1.5 ms to overflow
recovery. Within the full-size pass, 203 of 251 maps and about 20 ms come
from the size retries four and eight modules either side. The stage trace was
read from console output and not retained. `profile-ts.json` and
`profile-wasm.json` hold the profiles. The named WASM build used a plain
release `cargo build`, without the packaged build's path remapping or symbol
stripping, and its other sections were not compared with the packaged asset.

## Method

Each variant is an exact text substitution on the baseline's compiled
JavaScript (`harness/variant.mjs`, `gate.mjs`, `probe.mjs`, `patchfile.mjs`,
`survive-variants.mjs`, `l6-variants.mjs`). `harness/driver.mjs` decodes every
image with the unpatched build and each variant in parallel processes on the
M4 Max, Node 24.21.0, and compares complete results, including finder
bookkeeping. A lost read is a baseline read the variant does not make; a
changed result is one where both read and any field differs.

The 5,538 corpus images are existing regression data: the 184 photographs,
their 2,944 transformations (related views, not independent pictures), the
stress, previously qualified, validation, synthetic, low-resolution, curved
and conformance sets, and 12 negative frames. The conformance pack repeats
some stress frames. Variants were chosen against these images, so they are
not validation evidence.

Two development sets were built here and are not validation either.
`spreadDev120` thins or thickens dark modules by 0.12–0.3 module, as
over-exposure, screen glow or ink spread do, across versions 2–40.
`step9Dev120` renders large modules as dots, scan lines, grain or squares,
with spread from −0.3 to 0.3 and three decoy finder patterns beside each
symbol. `harness/erosion/` generates both from the independent qrcode 1.5.4
encoder; the generators import no decoder.

TypeScript times in the parallel runs are indicative only. The single
qualified timing below uses `scripts/compare-wasm.mjs --negative`, two
sequential processes with 60 alternating pairs per case.

## Results

| Variant | Lost reads, corpus | Gained | Changed | Lost, spread set | Lost, step 9 set |
| --- | ---: | ---: | ---: | ---: | ---: |
| No size retries | 61 | 1 | 63 | 42 | |
| Retries 0, −4, +4 | 9 | 2 | 7 | | |
| Retries 0, +4, +8 | 0 | 1 | 3 | 5 | |
| Retries 0, +4, +8; both ways when the estimate gives no map | 0 | 1 | 3 | 4 | 6, 2 gained |
| Retries 0, +4, +8, −4 | 0 | 0 | 2 | | |
| Retries 0, −4, +4, +8 | 0 | 0 | 0 | 1 | |
| Retries only after a map of the triple has agreeing format copies | 38 | 3 | 35 | | |
| The same, charging each skipped size | 39 | 2 | 34 | | |
| Alignment search only when a corner map's format copies agree within 2 | 64 | 0 | 531 | | |
| The same within 3 | 48 | 0 | 372 | | |
| Loose finder pass: centre at least twice each outer dark run and at least each light run | 12 | 6 | 80 | | |
| The same, also requiring a centre of 3 pixels | 12 | 6 | 80 | | |
| The first rule in both finder passes | 16 | 6 | 400 | | |
| Loose pass: centre strictly longer than each outer dark run | 2 | 0 | 15 | | |
| Loose pass: centre strictly the longest of the five runs | 2 | 0 | 18 | | |
| Strictly longer, except inside the enlarged search | 1 | 0 | 14 | 0 | 0 |
| Strictly longer, only for windows of 14 pixels or more | 2 | 0 | 14 | 0 | 0 |
| The same, except inside the enlarged search | 1 | 0 | 13 | 0 | 0 |
| Reduced-size allowance 15 maps, every use | 0 | 0 | 11 | 0 | |
| Reduced-size allowance 20 maps, every use | 0 | 0 | 7 | 0 | |
| Reduced-size allowance 15 maps, step 9 only | 0 | 0 | 9 | 0 | 1 |

Blank entries were not run. Every variant that loses a read fails the
screen. No variant returned a wrong payload or read a negative frame in any
run. The retry orders 0, +4, +8 and 0, −4, +4, +8 lost thinned-module reads,
whose thin dark modules make the size estimate too large; the 15-map
step 9 allowance lost a scan-lined symbol behind decoys. Three variants with
no recorded loss are unqualified rather than accepted: the retry order
0, +4, +8, −4, run on neither development set, and the 15-map and 20-map
allowances for every use, not run on the step 9 set.

The upward-only retry order was the strongest candidate. Its paired WASM
timing, in `wasm-upward-1.json` and `wasm-upward-2.json`, changed the main
noise frame by −15.6% and −15.8%, the two 512 x 512 noise frames by about
−25%, the other 720p frames by −5% to −9%, the 1080p frames by −6% to −7%,
and clean, blank, stripes, checkerboard and gradient by under ±1%. With the
past-177 exception its full TypeScript suite passed except six tests, all
recorded work counts or conformance vectors rather than reads. The timed
build replaced the retry loop in `src/decode.ts` and both loops in
`rust/src/decode.rs` with `0, 4, 8` when the estimate gives a map and the
original `0, −4, 4, −8, 8` otherwise. Its packaged WASM was 264,880 bytes,
SHA-256 `cd77bfa6bdd5813fe9e7bf6584f7595410cdb6d5a3f331a3a1c528d1644d5311`;
that binary was not retained, and its hash is in the timing receipts. It still
lost four of the 120 thinned-module reads and six of the 120 step 9 reads,
gaining two, and the main noise frame would have stayed about twice
ZXing-WASM's time.

The centre-run rules cut indicative TypeScript time on stripes by 40–62%
and on checkerboard by 20–56%, and barely changed noise. The three rules
modelled on a twice-the-outer-run test lost reads in the stress, previously
qualified, low-resolution, curved and conformance sets. Every loss of the
strictly-longer rules was in the low-resolution set. Their cause was not
established.

## Accuracy on the development sets

| Set | QR baseline | ZXing-WASM 3.1.7 | Only QR | Only ZXing |
| --- | ---: | ---: | ---: | ---: |
| Thinned or thickened modules, 120 | 110 | 82 | 29 | 1 |
| Large dots, 30 | 30 | 27 | 3 | 0 |
| Large modules with scan lines, 30 | 27 | 16 | 12 | 1 |
| Large modules with heavy grain, 30 | 20 | 24 | 0 | 4 |
| Large squares, 30 | 29 | 25 | 4 | 0 |

Neither reader returned a wrong payload. At the strongest spreads QR reads
15 and 18 of 20 against ZXing's 4 and 4. Heavy grain with spread ink is the
one style here that favours ZXing: its four extra reads are versions 7 and
10 at spreads of −0.3, 0.2 and 0.3, where QR spends 217–308 maps without a
read. That is an accuracy gap to investigate, not a speed result. These are
synthetic renderings, not camera evidence.

## Reproduction

On the M4, with a built checkout of `e1e860b` at `ROOT`, the pinned rival
installation at `RIVALS` and the photograph cache present:

```sh
node harness/variant.mjs ROOT/dist dist-up 'for (const delta of [0, -4, 4, -8, 8]) {' 'for (const delta of first.length > 0 ? [0, 4, 8] : [0, -4, 4, -8, 8]) {'
node harness/driver.mjs ROOT RIVALS 6 OUT base=ROOT/dist up=dist-up --only photos184,photoTransforms2944,stress256,qualified160,validation192,synthetic96,lowres224,curved1120,curvedNew256,conformance94,negatives12,spreadDev120,step9Dev120
node harness/zx-any.mjs RIVALS step9
```

The substitutions match only the compiled JavaScript of `e1e860b`; each
patcher refuses a pattern that does not occur exactly once. `results/`
holds each run's summary; the per-image rows were not retained, except for
the spread set.
