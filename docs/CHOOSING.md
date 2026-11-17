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
| Evaluated curved distortion set | **44/96** | 42/96 |
| Earlier curved distortion set | 89/128 | **106/128** |
| Separate curved set frozen before evaluation | **53/128** | 52/128 |

These are finite datasets, including synthetic images made with our existing
renderer. They do not establish accuracy on every camera, application or kind
of damage. The evaluated sets are regression data, not unseen validation.
Both readers miss all 28 finder-occlusion cases in that stress set. QR 0.3.7
reads 2,872/2,944 rotated, mirrored and inverted views of the 184 photographs,
including all 16 views of one dense curved photo. These transformations are
related views, not independent photographs.

One terminal refinement retry improves the evaluated distortion set from 37 to
44/96 and the earlier 128-case set from 81 to 89/128. On a separate 128-case set
frozen before evaluation, QR improves from 48 to 53/128. These finite sets favour
different readers; they do not establish a universal accuracy lead. The newly
evaluated set is now regression data. The new recovery retains all earlier
successful results and metadata exactly in the checked sets, with no incorrect
QR payloads. Earlier geometry changes can alter correction counts and optional
alignment locations.
See [full methodology, identities and per-case evidence](../PERFORMANCE.md).

## Speed and trade-offs

On the recorded 0.3.0 Apple M4 Max/native Node 24 run, median clean 720p decoding is
1.590 ms for packaged QR WASM and 2.137 ms for ZXing-WASM. A ten-frame tracked
sequence totals 7.074 ms versus 19.737 ms. Random noise favours ZXing:
7.941 ms versus QR's 20.569 ms. These are desktop measurements, not phone
latency or battery measurements. Pure TypeScript has different costs.
The 0.3.2 paired checks keep clean/blank medians broadly unchanged; main noise
costs 3.6–3.9% more to reject in exchange for the additional accuracy. See the
performance report for both complete timing forks. The 0.3.3 change adds
about 0.2% to main-noise WASM medians in its two paired runs, with clean and blank
medians within 0.5%. Recovering the newly readable curved photo takes about
22.2 ms instead of the earlier 12.1 ms miss. Version 0.3.4 also recovers
seven inverted views; the original inverted view takes about 22.6 ms in WASM
versus a previous 12.6 ms miss. Main-noise WASM medians remain within 0.5%
in its two paired runs. The inverse image stays live longer during recovery.
Version 0.3.5 keeps main-noise WASM medians within 0.5% in two paired M4 runs.
Its newly readable rotated photo succeeds in about 21.7 ms, compared with
roughly 52.2 ms spent failing before. This is a specific recovery improvement,
not a general speed claim.

Version 0.3.6 recovers additional meshes at a bounded extra cost. The tested
persistent curved miss costs 3.0–3.8% more in WASM, and an existing success
after failed meshes costs 1.3–2.6% more. Clean and main-noise WASM medians
vary within 1.0% across the two paired runs. At most four retained grids add
125,316 module bytes plus metadata and extra sampling work. See the 0.3.6
performance section for all timings and storage bounds.

Version 0.3.7 adds one terminal attempt after all earlier paths fail. In two
paired M4 runs, main-noise WASM medians vary within 0.5% and clean within 0.4%.
The four newly recovered curved examples cost 13.4–21.2% more than their earlier
misses; the tested persistent curved miss costs 19.7–21.0% more. The explicit
limit is now five second looks and 7,187,500 alignment probes, with at most
156,645 retained module bytes plus metadata. This improves measured accuracy
at the cost of additional work on some difficult frames.

Accuracy takes priority over rejecting an unsuccessful frame quickly. A tested
mandatory finder-ring filter was rejected because it excluded known successful
damaged-code paths. Speed improvements must preserve the existing successful
regression cases and must not introduce incorrect payloads.

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
