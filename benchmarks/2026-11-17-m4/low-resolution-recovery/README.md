# Low-resolution recovery prototype

Baseline: QR 0.3.14. The candidate retains every earlier decoder path and adds
SPEC step 22. A full-size triple qualifies a picture of at most 262,144 pixels
when its finder module-size estimates average at most 2.5 pixels and its three
repeated-sighting counts total at least nine. After every earlier path fails,
one separately bounded ordinary search runs on a four-times-axis bilinear
enlargement. An already constructed inverse luminance receives a sequential
attempt. A picture that retained and attempted a step-21 quadratic descriptor
is excluded, so a curved-surface miss never pays for another terminal geometry
pass. The two searches share a separate 90-map/one-second-look allowance;
legacy Work counters do not include it.

## Local regression screen

This receipt ran on Apple M1 with native Node 24.21.0 as a correctness screen.
It is not the required M4 accuracy/performance qualification. The released
baseline JavaScript was checked against every generated hash in the 0.3.14
qualification receipt. The pinned ZXing-WASM 3.1.7 binary has SHA-256
`33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59`.

| Dataset | QR 0.3.14 | Candidate | ZXing-WASM 3.1.7 |
| --- | ---: | ---: | ---: |
| Photographs | 180/184 | **180/184** | 171/184 |
| Stress positives | 172/224 | **172/224** | 150/224 |
| Previously qualified positives | 69/128 | **78/128** | 55/128 |
| Synthetic validation | 174/192 | **174/192** | 169/192 |
| Earlier synthetic set | 92/96 | **92/96** | 89/96 |
| **All positives** | **687/824** | **696/824** | **634/824** |
| Negative controls rejected | 64/64 | **64/64** | 64/64 |

ZXing has 12 photographic misses and one wrong payload; each QR version has
four misses and no wrong payload. All nine candidate gains are ZXing misses.
Every earlier complete successful QR result and legacy Work counter is
preserved. No candidate wrong payload or negative false read occurred. The
candidate also recovers the independently labelled `decode-frames/frame-07.png`,
which is outside this 888-case table.

The expanded shared conformance pack has 94 frames: five new low-resolution
fixtures, 88 preserved earlier entries and the newly correct `frame-07`. All
previous conformance PNGs remain byte-identical. Verification passes are 524
TypeScript tests with photographs, the full Kotlin Gradle suite, and 50 Rust
tests plus one doctest in the all-feature configuration. Packaged
TypeScript/WASM result tests pass for all 94 frames. In addition,
`m4-regression-final-parity.json` checks every documented public result field
on all 1,112 accuracy/regression cases, normalising only internal TypeScript
finder bookkeeping to the documented x/y location fields.

The packaged WASM is 264,929 bytes, 3,098 bytes larger than 0.3.14, SHA-256
`1f581db1eba826a3d1268adea88bf96cce1cf2202bf1d8710c6e74a40b40bc45`.
These are candidate identities, not a release qualification.

See `local-regression.json` for every per-case status and Work counter and
`codex-review.md` for the independent review. Codex found a Kotlin
ties-to-even rounding discrepancy. The candidate now uses explicit half-up
rounding, SPEC states the tie rule, and two shared enlargement vectors check
all three ports. `codex-follow-up.md` confirms the finding is fully resolved
and reports no new correctness issue in the fix. `codex-accepted-review.md`
reports no correctness findings in the final policy. Its sole receipt-identity
finding is resolved by the four `bound-previous-*.json` runs, whose generated
JavaScript identities equal the final parity receipt.

## Fresh M4 accuracy result

The single unseen evaluation ran on the Apple M4 Max with native Node 24.21.0.
Its final complete receipt is `m4-regression-final.json`; all earlier 888 cases retain
the results and legacy Work counters shown above, with no failure.

| Fresh synthetic scope | QR 0.3.14 | Candidate | ZXing-WASM 3.1.7 |
| --- | ---: | ---: | ---: |
| All positives | 98/192 | **112/192** | 76/192 |
| 1 pixel per module | 0/32 | **0/32** | 0/32 |
| 1.5 pixels per module | 8/32 | **14/32** | 2/32 |
| 2 pixels per module | 13/32 | **18/32** | 10/32 |
| 2.5 pixels per module | 23/32 | **24/32** | 18/32 |
| 3 pixels per module | 27/32 | **28/32** | 21/32 |
| 4 pixels per module | 27/32 | **28/32** | 25/32 |
| Negative controls rejected | 32/32 | **32/32** | 32/32 |

The final candidate adds 14 exact reads: 12 QR-only and two also read by ZXing.
It returns no wrong payload. One-pixel-per-module cases remain unrecovered by all
three readers. The initial fallback read 114/192; the final curved-exclusion
policy intentionally declines cases 102 and 115 to preserve the historical
curved-miss timings. Final per-case evidence is `m4-regression-final.json`.
These are now regression data, not an unseen set for another candidate. The
independent encoder and shared synthetic renderer do not establish
physical-camera accuracy.

## Terminal work-cap qualification

The first M4 timing candidate allowed 720 terminal maps and four second looks.
It preserved the fixed clean/blank/noise medians across two forks but added
about 400% to `holdout-000` in TypeScript and 423–427% in WASM. On the smaller
`holdout-015` miss it added 587–595% in TypeScript and 1,435–1,447% in WASM.
Those results are retained in `unbounded-ts-*.json`,
`unbounded-wasm-*.json` and `unbounded-direct-*.json`; that candidate was not
accepted.

A 180-map/one-second-look candidate preserved all 16 fresh gains and all
1,112 statuses in `m4-regression-capped.json`, but did not materially reduce
persistent-miss latency. More importantly, replaying the exact historical
20-case workload exposed regressions on its two quadratic terminal misses:
95–185% in TypeScript and 131–225% in WASM. The `previous-ts-*.json` and
`previous-wasm-*.json` receipts reject that candidate.

The final policy excludes any picture that retained and attempted a step-21
quadratic descriptor. This intentionally declines fresh cases 102 and 115,
leaving 14 fresh gains and all nine earlier gains. An offline enlarged-search
diagnostic observed at most 72 maps and one second look among those 23 gains;
the final allowance is 90 maps and one second look. `m4-regression-final.json`
differs from the 16-gain receipt only in those two intentional misses, with all
1,112 legacy Work records unchanged. All M4 port suites and the byte-exact WASM
rebuild pass. Final timing receipts use the `final-*.json` names.

### Measured timings

Two independent processes per backend ran sequentially on the Apple M4 Max
with native Node 24.21.0. Each of 16 cases has 60 alternating measured pairs
after at least ten warm-up pairs and 500 ms. Complete results and input hashes
are asserted outside the timed call. Raw samples and p95 values are in
`final-ts-1.json`, `final-ts-2.json`, `final-wasm-1.json` and
`final-wasm-2.json`; `final-timing-summary.json` derives their changes.

| Backend / fixed case | 0.3.14 median range, ms | Candidate median range, ms | Change, fork 1 / 2 |
| --- | ---: | ---: | ---: |
| TS clean | 3.999–4.006 | 3.883–3.998 | -3.06% / -0.03% |
| TS blank | 2.925–3.070 | 2.940–3.077 | -4.21% / +5.18% |
| TS noise | 52.615–52.660 | 52.495–53.032 | -0.23% / +0.70% |
| WASM clean | 1.509–1.518 | 1.511–1.521 | +0.16% / +0.23% |
| WASM blank | 1.161–1.183 | 1.171–1.175 | -0.71% / +0.87% |
| WASM noise | 20.373–20.416 | 20.368–20.483 | +0.33% / -0.03% |

There is no repeatable fixed-case median regression. Earlier successful
controls in this new workload change by -3.81% to +0.67% in TypeScript and
-1.17% to +0.18% in WASM. These are paired case measurements, not a general
throughput claim.

The exact 20-case 0.3.14 timing workload was also replayed in two processes
per backend. Its two terminal misses now change by -0.54% to +0.26% in
TypeScript and -1.18% to +0.57% in WASM, replacing the rejected large
regressions. Its previous successful cases change by -1.58% to +1.21% in
TypeScript and -1.18% to +1.07% in WASM, with every complete result preserved.
All four `bound-previous-*.json` receipts include the exact final generated
JavaScript identity.

| Persistent qualifying miss | Backend | 0.3.14 median range, ms | Candidate median range, ms | Change range |
| --- | --- | ---: | ---: | ---: |
| holdout-000 | TS | 10.507–10.535 | 53.031–53.122 | +403% to +406% |
| holdout-015 | TS | 0.428–0.434 | 2.993–3.028 | +589% to +608% |
| holdout-000 | WASM | 4.173–4.232 | 21.840–21.843 | +416% to +423% |
| holdout-015 | WASM | 0.158–0.159 | 2.452–2.457 | +1,444% to +1,447% |

The nine measured new reads cost 70.23–616.92% more in TypeScript and
50.75–1,099.00% more in WASM than their earlier misses. This is the explicit
accuracy/latency trade-off on qualifying hard inputs, not a regression on the
fixed controls and not a general decoding-speed claim.

### Direct packaged-WASM comparison

Both libraries receive the same fixed 1280 x 720 RGBA frames with the same
60-pair contract and pinned ZXing options as 0.3.14.

| Fixed frame | Candidate QR median, ms | ZXing median, ms | QR p95, ms | ZXing p95, ms |
| --- | ---: | ---: | ---: | ---: |
| Clean | 1.497–1.516 | 1.863–1.887 | 1.571–1.592 | 1.980–2.001 |
| Blank | 1.153–1.161 | 2.103–2.120 | 1.188–1.204 | 2.169 |
| Noise | 20.306–20.323 | 7.660–7.693 | 20.540–20.624 | 7.859–7.915 |

QR remains faster on clean and blank frames and about 2.6 times slower on this
random-noise rejection workload. Both paired WASM runs finish with baseline
and candidate linear-memory capacities of 14,483,456 bytes; capacity is not
peak live heap. Desktop samples do not establish mobile or worst-case latency.

## Fresh M4 validation method

`generate.mjs` froze 192 positive and 32 negative cases before any decoder
evaluation. Their pixels and payloads are disjoint from the earlier stress and
qualification corpora. The generator imports no decoder. The manifest and
hashes are in `manifest.json`; the independent encoder is qrcode 1.5.4 and the
existing synthetic photograph renderer is a limitation. This is not physical
camera evidence.

Do not run these frames as an unseen set more than once. `compare.mjs --fresh`
refuses hosts whose CPU model does not identify an M4. On the M4, prepare the
released 0.3.14 `dist`, the pinned rivals installation and photo cache, then
run:

```sh
node compare.mjs ROOT BASELINE_DIST RIVALS NEW_OUTPUT --fresh
```

The helper refuses an existing output path, checks frozen input and baseline
identities, preserves every earlier complete success and legacy Work counter,
and writes full per-reader receipts. For a later candidate, accuracy acceptance
requires a fresh M4 corpus and performance acceptance requires paired M4
receipts for clean, blank, noise, qualifying misses, earlier successes and the
exact historical workload. This candidate's evidence is above; later source
changes require fresh verification. No general throughput, mobile-latency or
physical-camera claim is made.

`paired.mjs` enforces the M4/arm64 host and alternates 60 measured pairs after
at least ten warm-up pairs and 500 ms. Its 16 cases are the three fixed frames,
all nine gains, two qualifying persistent misses and two earlier successful
controls. Run two sequential processes per backend, using new output paths:

```sh
node paired.mjs ROOT BASELINE_DIST RIVALS ts BASELINE_WASM TS_OUTPUT
node paired.mjs ROOT BASELINE_DIST RIVALS wasm BASELINE_WASM WASM_OUTPUT
```

The baseline WASM must be the 261,831-byte 0.3.14 asset with SHA-256
`022993bfb6895152421aaf22673484c8d6fb60be3edae44d5eb85c927f28e326`.
Complete results and input hashes are checked outside the timed call. Capacity,
where recorded, is linear-memory capacity rather than peak live heap.

For the direct packaged-WASM/ZXing comparison on the same fixed RGBA frames,
run two sequential processes with new output paths:

```sh
node direct.mjs ROOT RIVALS DIRECT_OUTPUT
```

This uses the same warm-up and 60-pair contract and the same pinned ZXing
options and binary as the 0.3.14 direct comparison.
