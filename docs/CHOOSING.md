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
| Earlier curved distortion set | **109/128** | 106/128 |
| Previous curved holdout | **67/128** | 52/128 |
| Earlier separate curved holdout | **74/128** | 67/128 |
| Previous curved set frozen before evaluation | **81/128** | 70/128 |
| Previous curved set frozen before version-peer evaluation | **69/128** | 53/128 |
| Curved set frozen before alternate-grid evaluation | **64/128** | 57/128 |
| Latest curved set frozen before evaluation | **59/128** | 53/128 |

These are finite datasets, including synthetic images made with our existing
renderer. They do not establish accuracy on every camera, application or kind
of damage. The evaluated sets are regression data, not unseen validation.
Both readers miss all 28 finder-occlusion cases in that stress set. QR 0.3.12
reads 2,872/2,944 rotated, mirrored and inverted views of the 184 photographs,
including all 16 views of one dense curved photo. These transformations are
related views, not independent photographs.

Version 0.3.12 rechecks an existing refinement grid when its two format headers
agree on a different orientation or format hypothesis. This recovers eleven
more curved images, including one in the new 128-image set frozen before
evaluation. Across all eight evaluated curved sets, QR reads 571/992 (57.6%)
against ZXing's 500/992 (50.4%). Earlier successful results and metadata remain identical
in these checks, with no wrong QR payloads observed. These are measured dataset
results, not a universal accuracy claim.
See [full methodology, identities and per-case evidence](../PERFORMANCE.md).

## Speed and trade-offs

| Fixed frame | QR 0.3.12 WASM median | ZXing-WASM 3.1.7 median |
|---|---:|---:|
| Clean QR | 1.521–1.526 ms | 1.889–1.896 ms |
| Blank | 1.167–1.180 ms | 2.118–2.137 ms |
| Random noise, no QR | 20.265–20.303 ms | 7.703–7.729 ms |

These are packaged API timings, including each library's wrapper, on three fixed
1280×720 RGBA frames. Both readers receive identical pixels; their complete
results remain stable and neither changes the input. Two sequential M4 Max,
native Node 24.21.0 processes use 60 alternating measured pairs after at least
ten warm-up pairs and 500 ms. They do not establish mobile latency, battery use
or general throughput. Pure TypeScript has different costs.
Measurements were made on a working desktop with other applications open. No task-owned QR build, test or benchmark ran concurrently; alternating baseline and candidate calls share the same host conditions.

Version 0.3.12 adds no image sampling or secondary attempt. Compared with
0.3.11, it can retain one additional existing grid, check at most sixteen
orientations and perform one additional strict symbol validation.
The caps remain eight second looks, 11,500,000 alignment probes and 720 maps.
The conservative retained-grid bound is 250,632 module bytes; active buffers,
metadata and allocator capacity are additional. Unchanged search counters do
not imply unchanged CPU time because they do not count symbol validation.
Across two paired M4 runs, the five measured new reads change WASM median latency by -0.34–0.32% relative to their earlier misses. The three cases with a selected header that still fails to decode change by -0.58–0.01%; earlier successful curved cases change by -0.88–1.46%. These measurements do not establish a general speed improvement or a worst-case bound.

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
