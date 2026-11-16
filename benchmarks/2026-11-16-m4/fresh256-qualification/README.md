# First qualification of the frozen 256-case corpus

The accepted decoder was frozen before this first evaluation: implementation
`d6bc8d26517f713f10d8adde7ef4bc34ef19154d`, evidence checkout
`4d2ded8c2fffadaeb0904a85ff9aa64cce8eeb0f`, clean on M4. No algorithm, fixture,
parameter or threshold was changed after seeing these results. This corpus is
now evaluated regression evidence; it must not be presented as unseen again.

The root agent ran `qualify.mjs` once with native arm64 Node 24.21.0 on Apple
M4 Max. All 256 metadata records and pixel hashes matched the frozen manifest
before any decoder was loaded. The exact TypeScript, packaged WASM and pinned
ZXing-WASM 3.1.7 identities were checked. Each reader received identical RGBA
pixels, checked unchanged afterwards. Scoring requires both exact text and raw
UTF-8 bytes; misses, wrong payloads and false reads are separately recorded.
This is a correctness run, with no latency claim.

| Category | Our TypeScript and WASM | ZXing-WASM 3.1.7 |
|---|---:|---:|
| control | 28/28 | 28/28 |
| small | 14/28 | 14/28 |
| perspective | 27/28 | 28/28 |
| rotation45 | 28/28 | 21/28 |
| cropped-quiet | 28/28 | 28/28 |
| finder-erosion | 18/28 | 3/28 |
| finder-occlusion | 0/28 | 0/28 |
| blur-noise | 27/28 | 28/28 |
| All positive QR frames | **170/224 (75.89%)** | **150/224 (66.96%)** |
| Wrong positive payloads | 0 | 0 |
| Negative frames without a false read | 32/32 | 32/32 |

TypeScript and WASM agree on payload outcomes for all 256 cases. Both readers
correctly read 148 positives; ours alone reads 22 (seven rotation and fifteen
erosion cases), ZXing alone reads two, and neither reads 52. The ZXing-only
cases are `perspective-25` and `blur-noise-25`, both version 40, ECC M, scale 4.
These misses remain visible; no superiority on every image is claimed.

The positive corpus uses qrcode 1.5.4 as an independent encoder, but shares our
existing photograph renderer. It has short ASCII payloads forced through
versions 1, 2, 4, 7, 12, 20 and 40, all four ECC levels and correlated category
parameters. This is synthetic evidence, not an independent photographic or
physical-camera corpus. Zero false reads applies to these 32 negative inputs.

The external lockfile differs from the original generation environment. The
qrcode entry identity, every complete case record and rendered pixel hash,
and the ZXing binary identity match; both lock hashes are retained. No rival
package is added to this project's dependencies. Images are generated in
memory and discarded; only reproducible source, hashes and outcomes are kept.

## Identities and reproduction

- Manifest SHA-256: `ccaa10cce97579506cbeca720fc2752009c5a13fef267a22e59a84d020c0fff9`
- Generator SHA-256: `18f9a09f86df2c790f60143830bbff8587f5ac82c1c89ea734ef69aa306bde6d`
- JavaScript distribution SHA-256: `128823699b3be2fa93f623b7599a9793e140fccde5de0ba13c1d1c3cfd65cc34`
- WASM SHA-256: `1b03677a443be96a4ebd73510b675e86fb8cdd668303d1d0355639160970343f`
- ZXing WASM SHA-256: `33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59`
- Harness SHA-256: `d9ff1ccde5f3a5397fc8a44bec821b736f2891b5fab6601220fce65d1f5dd112`

Use the frozen generator and manifest under `../fresh-stress-unevaluated/`;
that historical directory name is retained for provenance. Do not run its
manifest-writing entry point. Build the pinned source and use the existing
external rival installation, then run with a new output path:

```sh
QR_RIVALS=/path/to/rivals \
QR_EXPECT_JS_SHA256=128823699b3be2fa93f623b7599a9793e140fccde5de0ba13c1d1c3cfd65cc34 \
QR_EXPECT_WASM_SHA256=1b03677a443be96a4ebd73510b675e86fb8cdd668303d1d0355639160970343f \
node qualify.mjs /path/to/qr /path/to/qr/dist /path/to/new-results.json
```

The harness refuses an existing output path before generation or decoder use.
It never overwrites the frozen fixtures. No post-result tuning was performed
in this qualification pass.
