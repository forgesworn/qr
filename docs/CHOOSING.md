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

These are finite datasets, including synthetic images made with our existing
renderer. They do not establish accuracy on every camera, application or kind
of damage. The evaluated sets are regression data, not unseen validation.
Both readers miss all 28 finder-occlusion cases in that stress set. Version
0.3.5 reads all 16 rotated, mirrored and inverted views of one dense curved
photograph, versus 14/16 in 0.3.4. Across all 2,944 transformations of the
184-photo set, correct reads rise from 2,870 to 2,872, without lost reads
or wrong text; these are related transformations, not independent photographs.
Trusted mesh continuation also recovers two of 18 evaluated curved sheets.
On a separate 96-case distortion set frozen before evaluation, QR improves
from 29 to 30 reads, while ZXing reads 42. Curvature remains a limitation,
and these measurements do not establish general curvature coverage.
Correction counts can change as sampling improves; the successful placement
can also supply a different optional alignment location.
The previously qualified 160-case set is now regression data: QR remains
69/128 on positives, with all 32 negatives rejected. The additional curvature
pass produces no gain on those cases.
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
