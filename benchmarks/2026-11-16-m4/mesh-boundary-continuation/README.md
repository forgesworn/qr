# Mesh boundary continuation

Paired M4 Max/native Node 24.21.0 qualification for 0.3.5, compared with released
0.3.4 at `e632910220e8bedf4a39220c65c83b260900f996`. All measured code is
uninstrumented. Builds and tests did not run concurrently with timings.

## Change and diagnosis

The old mesh held offsets constant beyond the alignment lattice and pinned
three synthetic lattice corners to zero. Those corners are not the actual
finder centres. After alignment acquisition, the new mesh fits a synthetic
corner only when its three neighbours are measured, preserving the original
map at the actual finder centre. Fully trusted outer cells continue to legal
module centres; unsupported cells retain the old clamp.

The change adds no map, alignment search or refinement pass. The frame limits
remain 720 maps, four second looks and 5,750,000 alignment probes. At most 49
trusted flags and three four-node fits are added per mesh. It also changes
interpolation inside the three fitted corner cells.

Stage diagnostics preserved decoder results, Work and pixels. They identified
errors near the mesh boundary, plus a separate timing-walk problem that is
not changed in this release. A globally bounded timing walk was rejected:
it gained two photo views but lost two others. Neither that guard nor an
additional retry is included here.

## Results and limits

| Set | Released 0.3.4 | Boundary continuation | ZXing-WASM 3.1.7 |
|---|---:|---:|---:|
| Target photo, 16 related transformations | 14 | 16 | — |
| All 184 photos, 16 transformations each | 2,870/2,944 | 2,872/2,944 | — |
| Original photographs | 180/184 | 180/184 | 171/184 |
| Stress positives | 172/224 | 172/224 | 150/224 |
| Previously qualified positives | 69/128 | 69/128 | 55/128 |
| Synthetic validation | 174/192 | 174/192 | 169/192 |
| Earlier synthetic regression | 92/96 | 92/96 | 89/96 |
| Evaluated curved sheets | 0/18 | 2/18 | — |
| Fresh distorted sheets | 29/96 | 30/96 | 42/96 |

All 64 negative controls remain rejected. No correct payload is lost and no
incorrect QR payload is found. Photo oracles independently provide text only;
synthetic frames also check bytes. ZXing produces one incorrect expected-text
outcome on the original photos. The fresh set was frozen before decoder
evaluation, using versions, scales and curve profiles different from the
18 evaluated sheets; it is now regression data. ZXing still leads there.

This geometry change does **not** preserve every old result object. Eight
previously successful cases in the 888-case regression have lower correction
counts; one also gains an optional alignment point from a different successful
placement. Forty-nine transformed-photo results change only their correction
count. The verifiers permit only correction-count changes and added optional
alignment points, compare every other field, and record those changes. They
compare **all** declared fields between TypeScript and packaged WASM, with
public points normalised to x/y because TypeScript may retain internal finder
counts. Input preservation is checked immediately after each backend call.

## Timing

Each backend has two independent paired processes. Each fixture warms up for
at least ten pairs and 500 ms, followed by 60 measured pairs alternating
execution order. Raw samples and input hashes are retained.

Main-noise WASM medians change by +0.13% and +0.41%; clean changes by +0.13%
and +0.61%, and blank by +0.67% and -0.06%. TypeScript main noise changes by
-0.13% and -0.08%; clean/blank variation stays within 1.1%. These small
differences do not establish a general speed improvement.

The newly readable rotated photo succeeds in 21.63–21.73 ms in WASM versus
a 52.15–52.17 ms miss, and 47.19–47.49 ms in TypeScript versus a
111.74–113.38 ms miss. Both WASM instances finish the sequence with
14,483,456 bytes of linear-memory capacity; this is not peak live memory.
The candidate binary is 227,276 bytes, SHA-256
`6e749ecc264e41d8a4eecc59552f4b00d445cdea02cf789ce844d3f9384b649e`.

## Evidence

- `production-regression.json`: 888 outcomes, work counts, hashes and permitted metadata changes.
- `production-backends.json`: complete public TS/WASM parity on those 888 cases.
- `production-photo-transforms.json`: 2,944 transformations, exact public backend parity and preservation checks.
- `production-fresh.json`, `fresh-manifest.json`: frozen 96-case inputs, outcomes and full public WASM parity.
- `production-sheet.json`: the earlier 18 sheets with unchanged input hashes and full public WASM parity.
- `ts-1.json`, `ts-2.json`, `wasm-1.json`, `wasm-2.json`: paired raw timing samples and binary identities.

The two new shared conformance fixtures use this project's encoder, whose
segmentation differs from the independent encoder used by the benchmark.
Both failed on 0.3.4 before the fix. Their addition leaves every earlier
conformance frame, stage, result and work count unchanged. Rust and Kotlin
pass their suites and the shared pack; extended benchmark parity here refers
specifically to TypeScript and packaged WASM. No physical-camera claim is made.

## Reproduction

Use native Node 24.21.0 and the pinned Rust toolchain. From a checkout of this
release, install project development dependencies, fetch the hash-checked
photos with `npm run fetch-photos`, and run `npm run build`. Install
`qrcode@1.5.4` and `zxing-wasm@3.1.7` in a separate scratch directory, not as
project dependencies. `build-production.cjs <repo> <new-build>` compiles the
released baseline from Git and the checkout's current TypeScript, recording
source and generated-code hashes. It needs the baseline Git object available.

Run, using absolute paths:

```sh
node build-production.cjs <repo> <new-build>
node production-regression.mjs <repo> <build> <rivals> <regression.json>
node verify-backends.mjs <repo> <build> <rivals> <regression.json> <backends.json>
node production-photo-transforms.mjs <repo> <build> <photo-transforms.json>
node sheet.mjs <build> <rivals> <sheet.json> <repo>
QR_WASM_ROOT=<repo> node fresh.mjs <build> <rivals> <fresh-manifest.json> <fresh.json>
node paired.mjs <repo> <build> ts <baseline.wasm> <candidate.wasm>
node paired.mjs <repo> <build> wasm <baseline.wasm> <candidate.wasm>
```

Copy the committed fresh manifest to the scratch directory: the runner verifies
all regenerated cases against it before evaluation. `fresh-initial.mjs` retains
the original generator identified by that manifest; the current runner adds
frozen-manifest readback and WASM parity. Obtain the baseline binary from
`v0.3.4:wasm/qr.wasm`. Run timing processes serially and save stdout separately
for both forks. Reuse the checkout's Rust target directory. Remove only the
scratch directories and build outputs created for the reproduction.
