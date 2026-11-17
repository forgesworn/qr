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

The recorded comparison uses our optional packaged WASM and ZXing-WASM 3.1.7.
Each reader receives the same inputs. A correct read requires the expected
payload; the synthetic suites also check its bytes.

| Dataset | QR | ZXing-WASM |
|---|---:|---:|
| Existing photograph collection | **180/184** | 171/184 |
| 192-case synthetic regression set | **174/192** | 169/192 |
| Frozen stress set: positive frames | **172/224** | 150/224 |
| Previously qualified synthetic positives | **69/128** | 55/128 |
| Eroded finders within that stress set | **18/28** | 3/28 |
| Wrong payloads in the stress set | 0 | 0 |
| False reads on its 32 negative controls | 0 | 0 |
| Evaluated curved distortion set | **48/96** | 42/96 |
| Earlier curved distortion set | **108/128** | 106/128 |
| Previous curved holdout | **63/128** | 52/128 |
| Earlier separate curved holdout | **72/128** | 67/128 |
| Previous curved set frozen before evaluation | **80/128** | 70/128 |
| Latest curved set frozen before evaluation | **67/128** | 53/128 |

These are finite datasets, including synthetic images made with our existing
renderer. They do not establish accuracy on every camera, application or kind
of damage. The evaluated sets are regression data, not unseen validation.
Both readers miss all 28 finder-occlusion cases in that stress set. QR 0.3.10
reads 2,872/2,944 rotated, mirrored and inverted views of the 184 photographs,
including all 16 views of one dense curved photo. These transformations are
related views, not independent photographs.

One final strict late pass for a retained map with conflicting version evidence
raises the earlier 128-case result from 106 to 108, against ZXing's 106. A new
128-case set frozen before evaluating this policy stays at 67 correct reads,
against ZXing's 53; it is now regression data. QR leads on all six evaluated
curved distortion sets: 438/736 correct reads (59.5%) in total, against
ZXing’s 390/736 (53.0%). Earlier successful results and metadata remain identical
in these checks, with no wrong QR payloads observed. These are measured dataset
results, not a universal accuracy claim.
See [full methodology, identities and per-case evidence](../PERFORMANCE.md).

## Speed and trade-offs

| Fixed frame | QR 0.3.10 WASM median | ZXing-WASM 3.1.7 median |
|---|---:|---:|
| Clean QR | 1.513–1.518 ms | 1.849–1.879 ms |
| Blank | 1.169–1.180 ms | 2.086–2.150 ms |
| Random noise, no QR | 20.275–20.352 ms | 7.681–7.703 ms |

These are packaged API timings, including each library's wrapper, on three fixed
1280×720 RGBA frames. Both readers receive identical pixels; their complete
results remain stable and neither changes the input. Two sequential M4 Max,
native Node 24.21.0 processes use 60 alternating measured pairs after at least
ten warm-up pairs and 500 ms. They do not establish mobile latency, battery use
or general throughput. Pure TypeScript has different costs.

Version 0.3.10 adds one final late refinement for a retained version-peer map.
It retains one candidate/basis record and at most seven attempt records, with
caps of eight second looks, 11,500,000 alignment probes and 720 maps. The
156,645-byte logical optional grid bound remains unchanged; active buffers and
allocator capacity are additional.
The two new recoveries cost 19.99–23.21% more in WASM than the earlier failed attempts.
Five qualifying images that still fail cost 16.76–29.45% more. Earlier curved successes
have median changes from -1.09% to +0.75%. The additional recovery is an explicit
accuracy/time trade-off.

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

Start with the [installation and recipes](../README.md). Test your own cameras,
lighting, printed sizes and damaged examples; measure exact payloads, misses,
false reads and time to the first correct read. Use a worker, keep at most one
frame in flight, and reset a tracked session when changing cameras. Compare
the TypeScript and optional WASM backends on your actual devices.
