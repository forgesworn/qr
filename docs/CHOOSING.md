# Choosing a QR library

Choose `@forgesworn/qr` when you need to **make and read QR codes**, control your
own camera interface, and keep scanning inside your application. The TypeScript
package has no runtime dependencies, performs no network requests and needs no
API key. The optional WebAssembly backend is loaded explicitly by your code.
The library and its Kotlin and Rust sources are MIT licensed.

## Where it fits

| Requirement | What QR provides |
|---|---|
| Generate and read in one package | Text and byte encoding, SVG/canvas/terminal rendering, pixel and module-grid decoding |
| Browser, worker and Node integration | Typed ESM API; synchronous operations after optional WASM initialisation |
| Repeated camera frames | Independent tracked sessions, fresh payload reads and same-call full-frame recovery |
| Difficult QR images | Perspective, rotation, inversion, mirroring and bounded recovery for damaged or bent symbols |
| Inspectable behaviour | A written specification, shared conformance vectors and reproducible comparison receipts |
| Local processing | No built-in upload, telemetry, camera service or hosted decoding dependency |

Local processing describes the library. Your application, chosen asset host and
camera permissions determine its wider privacy behaviour.

## Measured accuracy

### Photograph comparison

ForgeSworn QR 0.3.15 and ZXing-WASM 3.1.7 read the same 184 greyscale
reference photographs. The comparison checks the exact labelled text.

| Reader | Exact reads | Misses | Text mismatches |
|---|---:|---:|---:|
| ForgeSworn QR 0.3.15 TypeScript | **180/184** | 4 | 0 |
| ForgeSworn QR 0.3.15 WebAssembly | **180/184** | 4 | 0 |
| ZXing-WASM 3.1.7 | 171/184 | 12 | 1 |

ZXing-WASM read one photograph that ForgeSworn missed. The photograph sets
are reusable regression collections from existing projects. The result
measures performance on these images. See the
[run receipt](../benchmarks/2026-11-18/photo-comparison.json) and
[fixture manifest](../vectors/photos.json) for exact versions and case IDs.

To repeat the comparison, use Node 24 and a JDK 17 or later. Run these
commands from the QR repository. The runner verifies the labels and pixels
against the manifest, and prints JSON with the scores and build identities.

```sh
npm ci
npm run fetch-photos
(
  qr_rivals=$(mktemp -d)
  trap 'rm -rf -- "$qr_rivals"' EXIT
  npm install --prefix "$qr_rivals" --ignore-scripts --no-audit --no-fund --save-exact zxing-wasm@3.1.7
  node scripts/compare-libraries.mjs "$qr_rivals" --photos-only
)
```

### Synthetic qualification

The QR 0.3.14 TypeScript and WASM results matched across 2,264 accuracy and
regression cases. Each reader received the same inputs. The synthetic suites
also compare the exact payload bytes.

| Dataset | QR | ZXing-WASM |
|---|---:|---:|
| 192-case synthetic regression set | **174/192** | 169/192 |
| Frozen stress set: positive frames | **172/224** | 150/224 |
| Previously qualified synthetic positives | **69/128** | 55/128 |
| Eroded finders within that stress set | **18/28** | 3/28 |
| Wrong payloads in the stress set | 0 | 0 |
| False reads on its 32 negative controls | 0 | 0 |
| Evaluated curved distortion set | **52/96** | 42/96 |
| Earlier curved distortion set | **124/128** | 106/128 |
| Previous curved holdout | **80/128** | 52/128 |
| Earlier separate curved holdout | **82/128** | 67/128 |
| Previous curved set frozen before evaluation | **90/128** | 70/128 |
| Previous curved set frozen before version-peer evaluation | **79/128** | 53/128 |
| Curved set frozen before alternate-grid evaluation | **77/128** | 57/128 |
| Curved set frozen before header-rediscovery evaluation | **72/128** | 53/128 |
| Curved set frozen before selected-mesh evaluation | **87/128** | 69/128 |
| New curved set frozen before quadratic evaluation | **118/256** | 77/256 |

These are finite datasets, including synthetic images made with our existing
renderer. They do not establish accuracy on every camera, application or kind
of damage. The evaluated sets are regression data, not unseen validation.
Both readers miss all 28 finder-occlusion cases in that stress set. QR 0.3.14
reads 2,872/2,944 rotated, mirrored and inverted views of the 184 photographs,
including all 16 views of one dense curved photo. These transformations are
related views, not independent photographs.

Version 0.3.14 fits a terminal quadratic surface to six already measured
alignment nodes and three finder anchors. It runs only after all earlier
reads fail, chooses the first strict format agreement before one symbol read,
and preserves the existing version and payload checks. Across the earlier
1,120 curved frames QR improves from 653 to 743 exact reads against ZXing's
569. The separately frozen 256-frame set improves from 65 to 118 against
ZXing's 77. Combined, that is **861/1,376 versus 646/1,376**, with 143 gains
over 0.3.13. Both read 632; QR alone reads 229, ZXing alone reads 14, and
neither reads 501. Earlier complete successful results and inputs are
preserved, with no wrong QR payloads observed. The 888-case regression suite
and its 64 negative controls are unchanged.

The new validation set contains 64 images per mathematical profile: QR reads
61 parabolas versus ZXing's 27, 32 circular arches versus 23, and 25 cubic
skews versus 27. Neither reads any of its 64 double-wave cases. Pixels and
payloads were disjoint from the earlier 1,120 before evaluation; version
sizes overlap earlier work. These are synthetic renderings, not evidence of
accuracy on arbitrary physical surfaces or cameras, and the evaluated set is
now regression data.
See [the release evidence](../benchmarks/2026-11-17-m4/quadratic-mesh-recovery/README.md)
and [full methodology and history](../PERFORMANCE.md).

## Speed and trade-offs

| Fixed frame | QR 0.3.14 WASM median | ZXing-WASM 3.1.7 median |
|---|---:|---:|
| Clean | 1.595–1.618 ms | 2.016–2.027 ms |
| Blank | 1.216–1.238 ms | 2.231–2.237 ms |
| Noise | 21.304–21.321 ms | 8.013–8.079 ms |

These are public-API timings on three fixed 1280 × 720 RGBA frames. Two
sequential native Node 24.21.0 processes on an M4 Max use 60 alternating pairs
after at least ten warm-up pairs and 500 ms. Complete results and inputs stay
unchanged. Other desktop applications were open; no task-owned QR computation
ran concurrently. This does not establish mobile latency or general throughput.

The twelve sampled new curved reads cost 0.18–4.27% more WASM median time
than the earlier misses; TypeScript costs 0.66–6.06% more. Two confirmed
terminal-sampling misses cost 0.10–1.53% more in WASM and 1.24–2.04% more in
TypeScript. Accuracy improves at a measured runtime cost. Random-noise
rejection remains about 2.6× slower than ZXing.

Version 0.3.14 keeps the eight legacy second looks, 11,500,000 alignment probes
and 720 maps, then permits one additional terminal threshold computation,
at most 4,761 bilinear module samples and one symbol read. Legacy Work does
not count this added pass. Earlier successful paths can still pay for one
bounded offset snapshot. The descriptor uses 144 logical bytes plus metadata;
the existing 281,961-byte retained-grid bound excludes the new active grid,
threshold buffers, temporaries and allocator capacity. These are not peak-heap
bounds. The packaged WASM is 261,831 bytes, 8,908 bytes larger than 0.3.13.

Accuracy takes priority over rejecting an unsuccessful frame quickly. A tested
mandatory finder-ring filter was rejected because it excluded known successful
damaged-code paths. Speed improvements must preserve existing successful
regression cases and must not introduce incorrect payloads. See
[the full performance report](../PERFORMANCE.md) for raw timings, p95 values,
source identities, earlier releases and remaining limitations.

## When another library is a better fit

- You need formats beyond ordinary QR Code Model 2, such as Data Matrix,
  Aztec, PDF417, Micro QR or linear barcodes.
- You want a ready-made camera interface, permission flow and viewfinder.
- You require CommonJS, an older JavaScript target, or an established native
  mobile SDK with device evidence for your supported hardware.
- Your workload is dominated by rapidly rejecting highly textured images:
  ZXing is faster on our recorded random-noise test.

QR returns one result per decode call. It does not promise multi-code detection,
authenticate the contents of a QR code, or decide whether a decoded URL is safe.
Treat decoded payloads as untrusted input in the application.

## Evaluate it in your application

Start with the [browser demo and recipe](BROWSER.md) or the
[full integration guide](../README.md). For a real use of the encoder, see
[how Signet Login generates pairing codes](https://github.com/forgesworn/signet-login/pull/85).
Test your own cameras, lighting, printed sizes and damaged examples. Measure
exact payloads, misses, false reads and time to the first correct read. Use a
worker, keep at most one
frame in flight, and reset a tracked session when changing cameras. Compare
the TypeScript and optional WASM backends on your actual devices.
