# Frozen, unevaluated synthetic stress set

No decoder has been run on these 256 frames. Both neighbouring-row filters
were rejected by separate engineering fixtures before this corpus was opened.
This remains available for a future frozen candidate; it is synthetic evidence,
not an independent photographic corpus or physical-camera acceptance.

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
