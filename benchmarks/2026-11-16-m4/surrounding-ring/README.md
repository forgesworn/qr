# Surrounding-ring shadow experiment: rejected as mandatory admission

The fixed surrounding-ring test is rejected as a mandatory finder/triple gate. No filtered decoder, Rust prototype or broad screening run was executed. Production source and the accepted decoder remain unchanged.

The diagnostic observes revision `5d468499de3127664b462fc646f10b807b86209d`. It applies one geometry-derived window, radius `ceil(4 * moduleSize)`, after an existing finder sighting passes its original cross-checks. It tests a dark 4-connected component, a surrounding light 8-connected component and enclosure by that light component. A complete-window escape is unsupported; image-clipped windows and light centre pixels are unknown and retained. Sightings are ORed on the original merged finder objects without changing their centres, counts or ordering. Successful ordinary and queued second-look paths retain their originating triple identity.

## Result and decision

Root executed the frozen diagnostic on the M4. All 38 cases matched the baseline's complete result, finder lists, Work counters and input bytes. The topology self-checks passed. There were 18 successful baseline decodes, each with exactly one success-provenance record; 13 had supported/retained triples and five did not:

- `inverted-flat-blocks-mirrored`: two of three finder members unsupported.
- `finder-damage-5-10-0`: all three unsupported.
- `finder-damage-4-11-0`: all three unsupported.
- `finder-damage-4-12-0`: all three unsupported.
- `finder-damage-5-10-10`: all three unsupported.

All four thin-centre regressions retained their successful triples. That does not offset rejecting the five other known successful paths. This fails the agreed preservation screen, so there is no radius sweep, broad 184-photo/192/256 run or Rust implementation.

These are rejected **successful baseline paths**, not five measured filtered-decoder misses: the diagnostic never removes candidates, and cannot establish whether another surviving path would recover the same result. Conversely, unchanged diagnostic outputs do not qualify the proposed admission policy as safe.

## Noise rejection and charged work

On the main 1280×720 seed-5 noise frame, 997 confirmed sightings produced 965 unsupported merged finders and seven retained unknown finders, with none supported. All 149 ranked triples, 96 executed locator calls, 341 sampled maps and 938,890 placement-area pixels belonged to unsupported triples. This establishes substantial potential downstream work rejection; it does not establish a net speed improvement.

The shadow test itself charged 107,063 image-byte examinations including setup, 161,232 neighbour probes, 40,520 queue pushes and 35,930 pops on that frame. Its cumulative logical queue/visited allocation was 1,281,785 bytes.

The clean frame retained all 27 sightings and all three merged finders, but charged 2,158,245 bytes of cumulative logical allocation (about 2.16 MB), 437,400 neighbour probes and 74,358 queue pushes/pops. It examined image bytes 80,703 times and made another 22,572 visited-mask membership probes in the enclosure stage. Peak reachable queue/visited storage was 31,974 bytes; this is distinct from cumulative allocation and does not promise immediate garbage collection. No timing result was collected.

## Evidence

- `results.jsonl`: root-executed 38-case receipt, including hashes, per-case outcomes, topology reasons, traversal charges and successful-triple support.
- `diagnostic/`: frozen portable builder, observer, topology self-checks and initial runner. Reproduction commands and hashes follow below.
- `diagnostic/broad.mjs`: prepared broad runner, deliberately **not executed** after the initial preservation failure. It is not qualification evidence.

The experiment supports the explanation that stronger ring requirements can reject random finder-like shapes while also excluding damaged QR structures that the current decoder reads. It does not measure how much of ZXing's noise advantage comes from its distinct structural tests.

## Reproduction

Run on the execution host with TypeScript installed in the repository, using
new output paths. The builder extracts the pinned Git revision rather than
reading mutable working-tree source.

```sh
node /path/to/diagnostic/build.cjs /path/to/qr /path/to/generated
node /path/to/diagnostic/run38.mjs /path/to/qr /path/to/generated > /path/to/results.jsonl
```

SHA-256 identities:

| File | SHA-256 |
|---|---|
| build.cjs | `069767dcce45a7d8d4daff369fdeeaf4eec53626c73fab29e9e9c0f9bac064e2` |
| observer.mjs | `419e5cc45d0127802fa1151b6c0e1ed4af8b6fa7aaaf1384ccb982e56a53ca1c` |
| run38.mjs | `d16fc32d6933c7a567163c1de42068a49449dcef74d3e304a1d32caaca32a693` |
| broad.mjs (not executed) | `d94c5f1add142f3e317b2e33e68e970cd69c3a053d1ddb24271a201bf5ff31ba` |
| results.jsonl | `f98c0fc6ed0794bb39e6131d1994888a56c37a589086220b647d15f9eb721478` |
