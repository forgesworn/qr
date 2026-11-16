# Surrounding-ring shadow diagnostic

Source-only preparation pinned to `5d468499de3127664b462fc646f10b807b86209d`; no local build, execution or timing. The builder obtains TS sources, fixtures and helper sources from Git, not the working tree. Run on the authorised host:

```sh
node /path/to/diagnostic/build.cjs /path/to/qr /path/to/new-generated-directory
node /path/to/diagnostic/run38.mjs /path/to/qr /path/to/new-generated-directory > /path/to/receipt.jsonl
```

The committed 38-fixture budget-dead runner supplies the corpus, including all four thin-centre cases. The separate broad runner is independently owned; do not run additional corpora until authorised. Each case compares complete result, finder lists, Work and input-byte hashes against the pinned baseline, and asserts one successful provenance record for each non-null result. Synthetic topology checks execute first on the authorised host.

Every original confirmed sighting receives one fixed shadow test at its refined floored centre and original total/7 module size. Its inclusive window has radius ceil(4m). Image clipping and light centre are unknown/retain. The dark centre's 4-connected flood, followed by the immediately-above light 8-connected flood and finally the centre's 4-connected flood through the white component's complement, classifies the remaining sightings. Boundary escape is unsupported for each respective stage. The radius follows finder geometry with half-module margin; it is an engineering hypothesis, not a proof for arbitrary images.

Support and unknown status are ORed onto the exact original merged finder identity. Every actual finder centre, count, ordering and search operation remains intact. The diagnostic records final merged finder support, ranked triples, locate calls and scanned window areas, emitted/read maps, plus ordinary and queued-second-look successful triple provenance. Unsupported-work totals describe baseline attribution, not achieved savings: a real gate can change later budgets and second-look exposure even when it retains all merged finders and rejects only unsupported triples. It does not prove decoding equivalence.

Stage counters cover neighbour probes, accepted queue pushes/pops, repeated neighbour examinations, peak live queue, peak reachable typed-array bytes, and cumulative allocated logical typed-array bytes per stage. `setupPixelReads` counts centre and above-component checks; dark/light stage `examined` counts image-pixel neighbour tests, while complement examinations query the white mask. Peak bytes include full queue/visited arrays and, for complement, the retained white mask; The dark mask reference is explicitly released before light flood; queues leave scope when their flood returns. This is a logical live-reference estimate, not a claim that garbage collection has reclaimed those arrays. JS object/allocator overhead and production implementation costs are not estimated. No timing or speed claim is made.

SHA-256: builder `069767dcce45a7d8d4daff369fdeeaf4eec53626c73fab29e9e9c0f9bac064e2`; observer `419e5cc45d0127802fa1151b6c0e1ed4af8b6fa7aaaf1384ccb982e56a53ca1c`; 38-runner `d16fc32d6933c7a567163c1de42068a49449dcef74d3e304a1d32caaca32a693`. The runner records pinned source, fixture, observer and frame hashes in its receipt.
