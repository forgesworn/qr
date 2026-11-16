# Why the pinned ZXing decoder can reject noise sooner

The benchmark noise frame contains no QR code. Its latency measures unsuccessful
search, not the ability to recover a QR payload through noise. Our accepted
packaged WASM takes 19.975 ms against ZXing-WASM 3.1.7 at 7.872 ms in the recorded
M4 comparison. Both engines run as WebAssembly.

The actual installed package exports ZXING_CPP_COMMIT
`f19f7c6e0509fe0eeb822bf35c41b0f637dec290`. The source links below are pinned
to that revision, rather than Java ZXing or a moving C++ branch. Default options
read from that same package specify downscaleFactor 3, downscaleThreshold 500,
LocalAverage binarisation and tryDenoise false. Our benchmark explicitly enables
tryHarder, rotation, inversion and downscaling, with one requested QR symbol.

| Stage | Pinned ZXing implementation | Our current implementation |
|---|---|---|
| Cheap row test | Rejects a centre run below three pixels, below twice either outer dark run, or below either white run, before the full pattern test | Five-run tolerance test, with strict and relaxed passes |
| Finder confirmation | Vertical, horizontal and both diagonals must pass; then surrounding-ring validation | Vertical, horizontal and one diagonal, with tolerant recovery |
| Repeated scan work | Ignores centres inside already confirmed finder regions; fixed three-row step with tryHarder | Merges repeated sightings; row step falls to one on smaller reduced images |
| Resolution search on 1280×720 | Full size and 426×240 with the default factor/threshold; both polarities | Full size and reductions by 8, 4 and 2, each with bounded searches and two tolerances; separate recovery paths when eligible |

Sources: [row filtering and scan](https://github.com/zxing-cpp/zxing-cpp/blob/f19f7c6e0509fe0eeb822bf35c41b0f637dec290/core/src/qrcode/QRDetector.cpp#L37-L90),
[directional confirmation](https://github.com/zxing-cpp/zxing-cpp/blob/f19f7c6e0509fe0eeb822bf35c41b0f637dec290/core/src/ConcentricFinder.h#L105-L141),
[ring validation](https://github.com/zxing-cpp/zxing-cpp/blob/f19f7c6e0509fe0eeb822bf35c41b0f637dec290/core/src/ConcentricFinder.cpp#L268-L285),
[resolution pyramid](https://github.com/zxing-cpp/zxing-cpp/blob/f19f7c6e0509fe0eeb822bf35c41b0f637dec290/core/src/ReadBarcode.cpp#L139-L188).
Local counterparts are `rust/src/locate.rs`, `rust/src/decode.rs` and the search
constants in `rust/src/lib.rs`. Budget exhaustion can stop later work; the
number of potential passes is not a count of all passes actually executed.

The upstream directional-validation comment explicitly describes a tradeoff:
permitting one failed directional check can help damaged finder patterns but
made its false-positive images approximately 20% slower. That is upstream
experience, not a measured M4 ablation or an explanation of 20% of our gap.
Zero tolerated failed checks does not mean zero tolerated pixel damage;
the individual pattern checks still have tolerances.

Our current main-noise observer records 341 attempted sampling maps, 413,395
cross-check pixel steps and 938,890 alignment-window pixels. These are the
unchanged decoder's contractual Work counters, not an equivalent set of
measured ZXing counters. The stronger early structural tests are a plausible
explanation for fewer false candidates reaching expensive placement, but we
have not measured their individual contribution to the 2.54-times latency gap.

The new frozen corpus reads 18/28 erosion cases with ours versus 3/28 with
ZXing. This is consistent with a robustness/speed tradeoff but does not prove
which gate caused it. Simply copying strict rejection rules would alter our
acceptance policy and could sacrifice valid damaged reads.

The next useful experiment is a matched candidate-survival trace: row matches,
confirmed finders, triples, placement attempts and sampled grids for both
engines on identical noise and damaged-code inputs. Test each proposed early
rejection independently against preserved reads. This is a research target,
not an implemented fast path or a claim that the remaining gap is solved.
