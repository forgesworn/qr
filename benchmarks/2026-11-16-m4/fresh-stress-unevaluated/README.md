# Frozen synthetic stress set: evaluated after the source freeze

These 256 frames were first decoded only after the accepted implementation
`d6bc8d2` was frozen. Both neighbouring-row filters were rejected by separate
engineering fixtures before this corpus was opened. The generator and manifest
remain unchanged; the directory name records its original unevaluated state.
[First qualification results](../fresh256-qualification/README.md) are 170/224
correct positive reads for our TypeScript/WASM and 150/224 for ZXing, with zero
wrong payloads and zero false reads on 32 negatives. This is now regression
evidence, not an unseen set, independent photographic corpus or physical-camera
acceptance.

There are 224 QR frames (eight categories, seven versions and four ECC levels)
and 32 negative controls. The generator uses external qrcode 1.5.4; the copied
photograph helper is pinned by hash. The manifest records expected text/bytes,
parameters and pixel hashes. Frames are generated on demand, not stored.

Set QR_RIVALS to an external directory with pinned qrcode 1.5.4 installed.
Import makeCase(group, index) from generate.mjs to recreate a case; verify its
metadata against the frozen manifest before decoding. Running the generator
directly overwrites manifest.json, so use a scratch copy for reproduction.

Freeze history, all before any decoder evaluation:

- original-v1: initial design; its quiet-margin setting was not a true crop.
- corrected-v2: crop to QR-corner bounding box and alternate small scale 1/2.
- Current: require QR_RIVALS rather than a task-specific path. All 256 case
  records remain identical to corrected-v2; only provenance metadata changed.

Current generator SHA-256:
`18f9a09f86df2c790f60143830bbff8587f5ac82c1c89ea734ef69aa306bde6d`.
Current manifest SHA-256:
`ccaa10cce97579506cbeca720fc2752009c5a13fef267a22e59a84d020c0fff9`.
