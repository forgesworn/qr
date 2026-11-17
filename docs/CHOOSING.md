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
| Earlier curved distortion set | **106/128** | **106/128** |
| Previous curved holdout | **63/128** | 52/128 |
| Earlier separate curved holdout | **72/128** | 67/128 |
| Latest curved set frozen before evaluation | **80/128** | 70/128 |

These are finite datasets, including synthetic images made with our existing
renderer. They do not establish accuracy on every camera, application or kind
of damage. The evaluated sets are regression data, not unseen validation.
Both readers miss all 28 finder-occlusion cases in that stress set. QR 0.3.9
reads 2,872/2,944 rotated, mirrored and inverted views of the 184 photographs,
including all 16 views of one dense curved photo. These transformations are
related views, not independent photographs.

A final late alignment pass for retained maps previously given only ordinary
refinement raises the earlier 128-case result from 103 to 106, matching ZXing.
Two evaluated holdouts improve from 62 to 63/128 and 71 to 72/128. A new 128-case
set frozen before policy evaluation improves from 79 to 80/128, against ZXing's
70/128; it is now regression data. QR leads on four of these five distortion
sets and ties on one. This does not establish a universal accuracy lead.
Earlier successful results and metadata remain identical in these checks, with
no incorrect QR payloads observed. Earlier geometry changes can alter correction
counts and optional alignment locations.
See [full methodology, identities and per-case evidence](../PERFORMANCE.md).

## Speed and trade-offs

| Frame | QR 0.3.9 WASM median range | ZXing-WASM 3.1.7 median range |
|---|---:|---:|
| Clean QR | **1.49–1.50 ms** | 1.84–1.86 ms |
| Blank | **1.14–1.19 ms** | 2.08–2.15 ms |
| Random noise, no QR | 19.90–19.95 ms | **7.55–7.59 ms** |

QR takes about 19% less time on this clean frame and 45% less time on the blank frame;
ZXing rejects this random-noise frame about 2.6 times faster. See the
[direct comparison receipts](../benchmarks/2026-11-17-m4/ordinary-curvature-refinement/README.md).

These are packaged API timings, including each library's wrapper, on three fixed
1280×720 RGBA frames. Both readers receive identical pixels; their complete
results remain stable and neither changes the input. Two sequential M4 Max,
native Node 24.21.0 processes use 60 alternating measured pairs after at least
ten warm-up pairs and 500 ms. They do not establish mobile latency, battery use
or general throughput. Pure TypeScript has different costs.

Version 0.3.9 adds one final late refinement for a retained ordinary-only map.
It records the phases of up to six earlier attempts and allows at most seven
second looks, 10,062,500 alignment probes and 720 maps. The three terminal mesh
grids have sequential lifetimes, keeping the 156,645-byte logical optional grid
bound; active buffers and allocator capacity are additional.
The six newly recovered curved images cost 13–18% more in WASM than the old
failed reads, while two persistent misses cost 13–16% more. Routine WASM medians
are essentially unchanged in the paired runs. TypeScript clean-frame p95 rises
by 0.89–1.09 ms despite small median changes; these measurements do not establish
a general speed improvement.

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
