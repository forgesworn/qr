# Contrast-only threshold retry

Baseline: commit `d6b37f7`, the low-resolution candidate with the exact
TypeScript speed-ups. Its compiled JavaScript hashes to
`f019b9a76c7a91924b1869d33ed186a1e5ccc611f61fc70d1515b57f4d1f095b` and its
packaged WASM to
`1f581db1eba826a3d1268adea88bf96cce1cf2202bf1d8710c6e74a40b40bc45`
(264,929 bytes). Candidate: SPEC.md decoder step 23 in all three ports, an
uncommitted working tree on top of `d6b37f7`. Its compiled JavaScript hashes
to `e9feec59df4a378bde2b8a19ddc2696fab2d55c0a7184c0d0fa8026fe1e7ecb1` and its
packaged WASM to
`372d36e7e5750710f34e9f1274c078c8b54a10cd108c7adbbf4494e1a66be6a0`
(268,638 bytes, rustc 1.96.0, rebuilt byte for byte by
`scripts/build-wasm.mjs --check`). All runs were on the Apple M4 Max with
Node 24.21.0 unless stated.

## Diagnosis

Of the 1,016 positives in the low-resolution qualification, six were read by
pinned ZXing-WASM 3.1.7 and not by QR.

- One, `s2-qrcode-2-_940`, is a 41 x 41 picture from the oracle's own sample
  set. Both format copies match the QR Model 1 mask exactly and lie five bits
  from every Model 2 format codeword. QR decodes Model 2 only, so this miss is
  out of scope rather than a fault.
- Three, `validation-32`, `-128` and `-184`, are small codes at two pixels a
  module, blurred, on flat background. They have the three lowest contrasts
  of the 26 frames in that profile: 71, 73 and 80 grey levels. ZXing reads
  all three from the greyscale with its default local thresholds and also with
  a global histogram threshold. It reads none of them from QR's binary
  picture, so the gap is in thresholding, not in finder search.
- The other two are `low-resolution-validation-190`, which the new step also
  reads, and `holdout-124`, which it does not.

QR's step 2 follows the original local-threshold rule: a flat block (range 24
or less) takes half its minimum as its level unless its earlier neighbours say
otherwise. Averaged into the 5 x 5 windows of the code's own blocks, those
low background levels drag the thresholds below the code's faint dark modules
near its edge, where the finder rings are. Leaving flat blocks out of any
window that also holds contrasted blocks recovers all three frames.

## Policy alternatives

| Policy | Regression corpus | First fresh set | Codeless mixed frames, TypeScript |
| --- | --- | ---: | ---: |
| Replace step 2 everywhere | 24 gained, 23 lost | not run | not run |
| Terminal search, 90 maps, no pixel test | 13 gained, 0 lost | 476/480 | +23% to +45% |
| Terminal search, 30 maps, pixel test | 13 gained, 0 lost | 475/480 | +2% to +19% |
| **The same, both format copies required to agree (step 23)** | **12 gained, 0 lost** | **475/480** | **+2% to +14%** |

Replacing the binariser loses reads that earlier stages had tuned around, so
the rule runs only after every earlier path fails. At that point earlier
results and the legacy Work counters are preserved by construction. The pixel
test skips the search when no pixel would change side, as with black print on
white paper. On the gained reads of the 90-map build the stage needed one map
in 81 of 107 cases and at most 21 in 90%. Eight needed its second look.
Thirty maps lose one fresh read against 90.

The search reads a picture binarised a second way, which gives a codeless
frame one more chance to produce a false read. Step 23 therefore takes the
rule step 10 already uses for its second binarisation: every read, the
second look's included, needs both format copies to agree. Run side by side
with the version without that gate, it gave up one corpus read,
`stress256/finder-erosion-05`, and changed nothing on either fresh set or on
the stage-targeted frames, frame for frame. Neither version gave a false read
anywhere, so the gate is a precaution that these sets cannot measure. The
conformance frame `contrast-thresholds-format-gate.png`, the dark fixture with
four bits of its first format copy flipped, reads without the gate and must
not read with it, so the tests of all three ports pin the gate.

`results/replacement-regression.json`, `results/allowance-90-*.json` and
`results/non-strict-*.json` record the rejected policies, and
`results/strict-choice.json` the side-by-side run. The other files in
`results/` record step 23 as built.

## First fresh set

Frozen before any decoder saw it: generator `harness/fresh.mjs`, SHA-256
`79eca6c4087c6e1e56cf133804568c3786f0ebb9d8b8fb3f26e48b2fd5511bde`, and
frames SHA-256 `6b74a0ba519530abfd42b273eae3519abc71477eb82a94fecd7c3027cdc5a597`,
recorded in `fresh-manifest.json`. The 480 positives are encoded by the
independent qrcode 1.5.4 encoder. Each is area-sampled through a rotated,
sheared and stretched map at 1.8 to 4 pixels a module, with contrast of 35 to
140 grey levels on paper of 90 to 230. The frames add a gradient of up to 40
levels, grain of 1 to 8, zero to two blur passes and light-on-dark printing in
one frame in six, at 480 x 360, 640 x 480 or 800 x 600. The 96 negatives use
the same backgrounds:

- fake symbols with real finder and timing patterns around random modules;
- scattered finder patterns among random blocks;
- text-like rows.

The 30-map allowance and the pixel test were then chosen on this set, so it
is a development set, not a holdout. The second set is the holdout. Both
target the failure. They are synthetic and do not establish physical-camera
accuracy.

| Fresh scope | Base | Candidate | ZXing-WASM 3.1.7 |
| --- | ---: | ---: | ---: |
| All 480 positives | 382 | **475** | 472 |
| Contrast 35-60 (106) | 36 | **105** | 106 |
| Contrast 60-85 (101) | 81 | **100** | 97 |
| Contrast 85-110 (112) | 107 | **111** | 111 |
| Contrast 110-141 (161) | 158 | **159** | 158 |
| 1.8-2.4 px a module (129) | 90 | **124** | 121 |
| 2.4-3 px a module (137) | 114 | **137** | 137 |
| 3-4.1 px a module (214) | 178 | **214** | 214 |
| Blur passes 0 (160) | 131 | **160** | 158 |
| Blur passes 1 (232) | 184 | **231** | 229 |
| Blur passes 2 (88) | 67 | **84** | 85 |
| Light on dark (80) | 58 | **79** | 80 |
| 96 negatives rejected | 96 | **96** | 96 |
| Wrong payloads | 0 | 0 | 0 |

ZXing reads three frames the candidate misses: fresh-173, fresh-211 and
fresh-434. The candidate reads six that ZXing misses. All five of its
remaining misses are at two pixels a module or fewer, four of them with two
blur passes. It gains 93 reads, and no decoder gave a wrong payload or read a
negative.

## Second fresh set

`harness/fresh-second.mjs` is `fresh.mjs` with only its seed changed. It was
generated and frozen after the allowance and the pixel test were settled:
generator SHA-256
`4a38dc7d4c3742b240fadf021d92dc38a1f17545f2248dd0f1bd610a7cd40e88` and
frames SHA-256 `48533c05f8ac9268b3a4006328563daa3bbab51bccd29bdcfd53177c69560b13`,
recorded in `fresh-second-manifest.json`. It has 480 positives and 480
negatives, 160 of each kind. Its first decoding was the side-by-side run of
the format gate, where both versions scored the same. Nothing was tuned on it.

| Second fresh set | Base | Candidate | ZXing-WASM 3.1.7 |
| --- | ---: | ---: | ---: |
| All 480 positives | 376 | **478** | 469 |
| Contrast 35-60 (109) | 42 | **108** | 107 |
| Contrast 60-85 (117) | 86 | **116** | 114 |
| Contrast 85-110 (111) | 106 | **111** | 110 |
| Contrast 110-141 (143) | 142 | **143** | 138 |
| 480 negatives rejected | 480 | **480** | 480 |
| Wrong payloads | 0 | 0 | 0 |

ZXing reads two frames the candidate misses, fresh-203 and fresh-399, both
under two pixels a module. The candidate reads 11 that ZXing misses and gains
102 reads.

## Stage-targeted frames

`harness/stage-negatives.mjs` makes 3,000 frames built to reach step 23:
faint content of 25 to 70 grey levels on flat paper of 90 to 230 with up to
six levels of grain, at 320 x 240 or 480 x 360, light on dark in one frame in
five. Five kinds hold no symbol and must never read:

- patches of noise;
- fake symbols, with real finder and timing patterns around random modules;
- one to three finder patterns among random modules;
- text-like rows;
- the stripes and checkerboards that mask patterns make.

The sixth kind holds a real symbol with a third of its modules outside the
finders flipped, past any error correction level. Its only acceptable results
are a miss or its own text.

| Stage-targeted kind | Frames | Reaching step 23 | Base | Candidate |
| --- | ---: | ---: | --- | --- |
| noise-patches | 500 | 500 | 500 clean | 500 clean |
| fake-symbol | 500 | 500 | 500 clean | 500 clean |
| finders | 500 | 500 | 500 clean | 500 clean |
| text-rows | 500 | 500 | 500 clean | 500 clean |
| mask-texture | 500 | 500 | 500 clean | 500 clean |
| damaged-real | 500 | 500 | 500 miss | 500 miss |

Every frame reaches the step's search: no earlier path reads it, and the
pixel test passes. None gives a false read, and every damaged symbol is a
miss.

## Regression corpus

The 5,778 images of the noise-policy screen, plus the five new conformance
frames, which the corpus reads from the regenerated pack. Three of the 15
gains are new fixtures, and the decoy and format-gate frames miss in both
builds, so the corpus proper gains 12.

| Regression suite | Images | Base correct | Candidate correct | Gained | Lost | Wrong | False reads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| photos184 | 184 | 180 | 180 | 0 | 0 | 0 | 0 |
| photoTransforms2944 | 2944 | 2872 | 2876 | 4 | 0 | 0 | 0 |
| stress256 | 256 | 172 | 172 | 0 | 0 | 0 | 0 |
| qualified160 | 160 | 78 | 78 | 0 | 0 | 0 | 0 |
| validation192 | 192 | 174 | 177 | 3 | 0 | 0 | 0 |
| synthetic96 | 96 | 92 | 92 | 0 | 0 | 0 | 0 |
| lowres224 | 224 | 112 | 113 | 1 | 0 | 0 | 0 |
| curved1120 | 1120 | 743 | 743 | 0 | 0 | 0 | 0 |
| curvedNew256 | 256 | 118 | 118 | 0 | 0 | 0 | 0 |
| conformance94, now 99 | 99 | 87 | 90 | 3 | 0 | 0 | 0 |
| spreadDev120 | 120 | 110 | 113 | 3 | 0 | 0 | 0 |
| step9Dev120 | 120 | 106 | 107 | 1 | 0 | 0 | 0 |
| negatives12 | 12 | 0 | 0 | 0 | 0 | 0 | 0 |
| **All** | 5783 | 4844 | **4859** | 15 | 0 | 0 | 0 |

Gained, beyond the three new fixtures:
`photoTransforms2944/s1-qrcode-4-08/r3/n/n`,
`photoTransforms2944/s1-qrcode-4-08/r0/m/n`,
`photoTransforms2944/s1-qrcode-4-08/r3/m/n`,
`photoTransforms2944/s1-qrcode-4-41/r0/m/i`,
`validation192/validation-32`, `validation192/validation-128`,
`validation192/validation-184`, `lowres224/low-resolution-validation-190`,
`spreadDev120/spread-dev-8`, `spreadDev120/spread-dev-18`,
`spreadDev120/spread-dev-23` and `step9Dev120/step9-dev-90`. Four are
rotations or mirror images of two of the 184 photographs, and three are from
the grain-and-spread-ink development set.

No result changed except by a gain. Maps and every other legacy Work counter
are identical image for image. The four gains that are qualification
positives, the three validation frames and `low-resolution-validation-190`,
take the low-resolution qualification from 808 to 812 of 1,016, against 710
for ZXing-WASM 3.1.7.

## Parity

The packaged WASM and the TypeScript give identical complete public results,
keys and locations included (finder bookkeeping reduced to x and y), on all
7,319 images: the 5,783 corpus images and the 1,536 frames of both fresh
sets, 5,812 of them reads. `results/parity.json` records it.

## Timing

`harness/timing.mjs` loads both TypeScript builds into one process, checks
that their complete results agree, and then alternates their calls: 40
measured pairs after eight warm-up pairs a frame. The four mixed frames are codeless
1280 x 720 pictures: half flat wall and half fine texture, text-like rows on
flat paper, shaded rectangles on a flat gradient, and a small code with its
centre removed on flat paper. It ran four times, each in a fresh process,
and once with the base build against itself (A/A) to show the noise floor.
Other sessions were using the M4 throughout; the compare-wasm receipts record
one-minute load averages of 6 to 10.

| Frame, 1280x720 | Read | Base median, ms | Candidate median, ms | Change, runs 1 to 4 | A/A |
| --- | --- | ---: | ---: | ---: | ---: |
| clean | yes | 3.221–3.477 | 3.250–3.385 | +0.88% / +5.09% / +0.77% / -2.95% | +0.65% |
| blank | no | 2.273–2.331 | 2.280–2.365 | +0.38% / +0.31% / -1.49% / +2.24% | +1.09% |
| noise | no | 43.918–44.835 | 43.784–45.378 | -0.31% / -0.34% / +1.05% / +1.21% | -0.11% |
| half-texture | no | 27.710–28.359 | 30.942–31.866 | +11.74% / +11.66% / +12.37% / +11.53% | -0.76% |
| text-page | no | 15.342–15.665 | 16.614–16.900 | +8.29% / +9.48% / +7.53% / +9.52% | -0.06% |
| objects | no | 20.107–20.711 | 22.849–23.415 | +12.96% / +14.46% / +13.05% / +12.23% | +0.10% |
| damaged-code | no | 9.762–10.270 | 10.268–10.549 | +5.19% / +4.10% / +2.11% / +2.72% | -0.72% |

Clean, blank and noise frames do not reach the stage's search: the clean
frame reads first, the blank frame is uniform, and noise has no flat block.
They show no consistent change. Mixed codeless frames pay for the
contrast-only thresholds and the pixel test and, when a pixel would change
side, for one more full-size search of at most 30 maps.

`harness/wasm-timing.mjs` times the base and candidate WASM the same way on
the four mixed frames:

| WASM frame, 1280x720 | Before median, ms | After median, ms | Change, runs 1 to 2 |
| --- | ---: | ---: | ---: |
| half-texture | 14.708–14.912 | 17.050–17.186 | +14.33% / +16.85% |
| text-page | 11.010–11.091 | 11.958–11.964 | +7.82% / +8.66% |
| objects | 9.725–9.791 | 11.558–11.661 | +19.10% / +18.84% |
| damaged-code | 4.542–4.589 | 4.924–4.940 | +7.31% / +8.77% |

The repository's `scripts/compare-wasm.mjs --negative` compares complete
results and then times the two modules on its fixed frames, 60 measured
rounds after warm-up. It ran three times, and once with the base module
against itself:

| compare-wasm frame | Size | Before median, ms | After median, ms | Change, runs 1 to 3 | A/A |
| --- | --- | ---: | ---: | ---: | ---: |
| clean | 1280x720 | 1.507–1.588 | 1.525–1.626 | +1.21% / +1.99% / +4.65% | +2.75% |
| blank | 1280x720 | 1.149–1.210 | 1.180–1.258 | +2.76% / +4.20% / +4.00% | -1.49% |
| noise | 1280x720 | 20.059–21.174 | 20.115–21.267 | +0.28% / -0.07% / +0.44% | -0.29% |
| noise-512x512-49ad7e32 | 512x512 | 15.045–16.012 | 15.050–15.976 | +0.03% / -0.50% / -0.23% | -0.63% |
| noise-512x512-fe13bc9 | 512x512 | 15.190–16.087 | 15.311–16.172 | +0.80% / +0.53% / +0.48% | -0.57% |
| noise-1280x720-49ad7e32 | 1280x720 | 16.840–17.442 | 16.796–17.512 | -0.26% / +0.13% / +0.40% | -0.16% |
| noise-1280x720-fe13bc9 | 1280x720 | 16.932–17.860 | 16.989–17.795 | +0.34% / +0.70% / -0.36% | +0.05% |
| noise-1920x1080-49ad7e32 | 1920x1080 | 26.531–27.641 | 26.496–27.690 | -0.13% / -0.20% / +0.23% | -0.35% |
| noise-1920x1080-fe13bc9 | 1920x1080 | 28.696–29.846 | 28.660–29.871 | -0.13% / +0.08% / +0.24% | -0.43% |
| stripes | 1280x720 | 7.905–7.921 | 7.914–7.947 | -0.09% / +0.33% / +0.53% | +0.16% |
| checkerboard | 1280x720 | 6.553–6.606 | 6.571–6.610 | +0.12% / +0.87% / -0.39% | +0.89% |
| gradient | 1280x720 | 3.949–3.982 | 4.300–4.315 | +8.89% / +8.11% / +8.51% | -1.61% |

The gradient has no block with contrast, so no window mixes flat and
contrasted blocks and no threshold can change, but the stage still makes its
pass over the blocks: about 0.35 ms. Returning early when no block has
contrast would remove that cost exactly; this candidate does not. The blank
frame's 3% to 4%, about 0.04 ms, is outside its A/A difference; the clean
frame's spread is not. Phones were not timed.

## Verification

The M4 also ran the CI steps that can run there on the final tree:

- 535 TypeScript tests with photographs required, on Node 24.21.0 and on
  Node 22.22.0 (the M4 has no 22.13), the typecheck, the documentation check
  and the package check;
- 51 Rust tests and a doctest with all features, the packaged crate's tests
  and doctest, and `cargo doc` with warnings denied;
- the reproducible WASM build check, the standalone WebAssembly build and the
  packaging, options, encoder, symbol, rendering and leak checks;
- 125 Kotlin tests, the staging publication, the Maven check and the
  photograph test with photographs required.

The JSR job needs Deno, which the M4 lacks, so it was not run. With the
format gate switched off in each port, the Rust conformance test fails on
`contrast-thresholds-format-gate.png` and the Kotlin conformance test fails;
with it restored, both pass. In TypeScript, a one-off run with the gate
switched off read that frame, and the step 23 tests check that it is refused
with the gate.

## Reproduction

```sh
node harness/freeze.mjs RIVALS fresh-manifest.json        # once, before evaluation
node harness/freeze.mjs RIVALS fresh-second-manifest.json fresh-second.mjs 480 480
node ../noise-policy-screen/harness/driver.mjs ROOT RIVALS 6 OUT base=BASE_DIST final=ROOT/dist \
  --only photos184,photoTransforms2944,stress256,qualified160,validation192,synthetic96,lowres224,curved1120,curvedNew256,conformance94,negatives12,spreadDev120,step9Dev120
node harness/fresh-run.mjs RIVALS fresh-manifest.json OUT.json base=BASE_DIST final=ROOT/dist
node harness/fresh-run.mjs RIVALS fresh-second-manifest.json OUT.json base=BASE_DIST final=ROOT/dist
node harness/stage-negatives-run.mjs RIVALS SHARD SHARDS OUT.jsonl base=BASE_DIST final=ROOT/dist
node harness/parity.mjs ROOT RIVALS ROOT/dist fresh-manifest.json,fresh-second-manifest.json SHARD SHARDS OUT.jsonl
node harness/timing.mjs BASE_DIST ROOT/dist OUT.json 40
node harness/wasm-timing.mjs ROOT/dist BASE.wasm ROOT/dist/qr.wasm OUT.json 40
(cd ROOT && node scripts/compare-wasm.mjs BASE.wasm dist/qr.wasm --negative)
node harness/tables.mjs results
```

`harness/profile.mjs` and `harness/stage-maps.mjs` are the diagnostics behind
the pixel test and the allowance; `stage-maps.mjs` needs a build that exposes
the stage's own counts. `compare-wasm.mjs` records `git rev-parse HEAD`; the
M4 copy has no repository, so its receipts name the base commit followed by
`+uncommitted-step-23`.
