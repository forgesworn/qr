# Fixed-eight scored duplicate prototype

Pinned baseline `bd23ee348e9f70fe8365c41ebcd3c54d165741f5`. Apply `scored-blocks.patch` to this revision. It changes only `rust/src/place.rs`; the supplemental paired runner is separate. No dependency, build output or target directory is created here. The original diagnostic and receipt remain independent.

The single candidate uses the original scored list, including low-score entries, and one block of four f64 bounds plus a validity flag per eight consecutive points. Queries visit blocks and original points in insertion order. Only finite bounds with finite query coordinates and finite nonnegative radius can be skipped, using the diagnostic's ordered sign and `abs(extremum - query) > radius` checks. Equality and invalid values fall through to the original square and distance predicate. The score, sorting, Work, locations and search budget remain unchanged. The independent original scalar predicate in tests returns the first index; it is compared over every prefix and unusual floating inputs, including block boundaries and low-score points. Original full `locate_reference` remains intact. These tests have not been compiled or run.

The supplemental runner takes a repository with its already-built `dist/wasm.js`, a generated output from the pinned `qr-scored-blocks-fabe/diagnostic/build.cjs`, and two explicit modules:

```sh
node supplement/paired.mjs /path/to/qr /path/to/scored-generated before.wasm after.wasm > /tmp/scored-supplement.json
```

It uses the original bent-version-12 PNG and the two finder-damage fixtures from the 28-case diagnostic, requiring their expected text and bytes. It compares complete decoded results and input hashes outside each timed call, alternates order, warms for at least 20 pairs and one second, then records 60 pairs per case. It records Node/architecture/CPU/load, source/helper/adapter/harness/wasm/frame hashes and raw samples. The pinned generated TypeScript source hash is checked before use. `readPng` and `photograph` supply greyscale frames directly, so no RGBA conversion occurs. The runner requires no new dependencies and does not use the held-out corpus.

SHA-256:

- `rust/src/place.rs`: `7bb724a49f44801d02b091fc2803bb3e77e7ed044fe32762f0bed7415a2236a6`
- `scored-blocks.patch`: `b6ab517cdd7c2837160d2bc3c637151cae441d8d4f353f5404334a321d7fd0c3`
- `supplement/paired.mjs`: `a26fd93524a5f660227a7f437c1f2c99bc5ad60c9f4d96c2e144138b52efab96`

No local build, transpilation, decoder invocation, tests or timing were run. Root owns review, all correctness gates, and coordinated M4 measurements. No performance conclusion is implied by diagnostic operation counts.
