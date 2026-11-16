# Final-module noise profile

This diagnostic samples the exact packaged `22ce2eec574d397baced1dada9e14afbaa4a3349f819d3f2af6c788bc8886aec`
module at revision `8aca1e4d3ca6756553dbea93432866d4d02d5f7b`, using native
arm64 Node 24.21.0 on M4 Max. The single 1280×720 RGBA noise frame matches the
competitive benchmark hash in `identity.json`.

After ten unprofiled warmups, `scripts/profile-decode.mjs` samples 150 sequential
full decodes at a requested 500 microsecond interval. Every decode returns no
result. The sampled duration is 3,418.875 ms. This is diagnostic sampling,
including assertions, wrapper overhead and runtime effects; it is not a
competitive latency measurement. The `work` field is measured by separate
TypeScript calls before sampling and is not instrumented WASM work.

| Function, including inlined work | Self-time share |
|---|---:|
| Finder scan | 25.94% |
| Placement search | 24.67% |
| Finder cross-checks | 11.25% |
| Row-edge generation | 7.77% |
| Alignment scoring | 6.40% |
| Reed–Solomon correction | 6.00% |
| Decode search | 4.78% |
| Other sampled work | 13.19% |

The first, third and fourth rows total 44.96%; placement and alignment scoring
total 31.06%. These are disjoint self-time buckets. Inclusive percentages in
the JSON overlap and must not be added. Inlined callees are attributed to
their containing functions. One failed frame does not establish a universal
workload distribution or prove that any of this work is removable. No new
optimisation is accepted from this profile.

`mapped-profile.json` borrows names only after the existing mapper verifies
that every ordered non-custom section of the name donor is byte-identical to
the measured stripped module. All ten sections match. `named-build.json`
records the compiler identity and both final path remaps; the donor omits only
the strip flag. The packaged module is never replaced by the donor.

## Reproduction

Use a scratch parent containing the already prepared `repo` checkout, its
existing Rust target and the accepted dist files. Copy the archived
`build-named.mjs` into that parent, use the pinned Rust 1.96.0 compiler, and run
these commands serially from `repo` with native arm64 Node:

```sh
node scripts/profile-decode.mjs 150 ../compiler196-final.cpuprofile wasm/qr.wasm > ../compiler196-final-profile.json
node ../build-named.mjs
node benchmarks/2026-11-16-m4/alignment-frontier/map-profile-names.mjs ../compiler196-final-profile.json wasm/qr.wasm ../compiler196-final-named.wasm > ../compiler196-final-mapped-profile.json
```

The complete raw profile and temporary name donor are removed after the compact
summary, validated section hashes and provenance are recorded. The raw-profile
hash remains in `identity.json`; it identifies the removed input, not a retained
artefact. Existing source tools and this build script reproduce the process.
