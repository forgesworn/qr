# Frozen synthetic qualification corpus

The generator and 160-case manifest were fixed before candidate evaluation.
The first results are retained in `../fresh160-results.json`: baseline and
candidate each read 69/128 positives, ZXing-WASM 3.1.7 reads 55/128, and all
readers reject all 32 negative controls. These cases are now regression data.

No decoder is imported by the generator. The manifest records payloads,
geometry, seeds and grey hashes; all 160 pixel hashes are unique. It covers
eight versions and all four error-correction levels with independently varied
perspective, rotation, scale, inversion, mirroring, damage and distractors.
It refuses to overwrite a manifest. Copy the generator and photo helper to a
new directory to reproduce generation without replacing the frozen manifest:

```sh
QR_RIVALS=/path/to/rivals node /path/to/copied/generate.mjs
```

External qrcode 1.5.4 also encoded the earlier stress corpus; the shared
photograph renderer remains a limitation. This synthetic set does not establish
physical-camera or photographic performance. Some one-pixel-per-module cases
may be unrecoverable after rendering; no 128/128 acceptance floor is implied.
