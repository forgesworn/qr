# Version 40 failure-stage observer

Source-only preparation pinned to `3c06d8047287994a6e071e87425de1b04cc66d10`. No local build, transpilation, decoder, timing or tests have been run. It reproduces only the frozen `perspective-25` and `blur-noise-25` cases from the committed fresh256 manifest; it requires the frozen external qrcode 1.5.4 installation in `QR_RIVALS`. No fixture, payload or decoding threshold is modified.

On the authorised host, with repository TypeScript installed:

```sh
node /path/to/build.cjs /path/to/qr /path/to/new-generated-directory
QR_RIVALS=/path/to/rivals node /path/to/run.mjs /path/to/qr /path/to/new-generated-directory > /path/to/receipt.jsonl
```

The builder extracts pinned Git objects. The runner checks generator, manifest, photography helper and qrcode-entry hashes; checks exact frozen metadata and grey frame hashes; and compares complete observed results, every Work field, finder lists and input bytes with a separate baseline. It records source/tool identities and the rival lock hash. These are TS observations, distinct from the separately qualified accepted WASM binary.

Truth points are the generator's projected centres of the three finder patterns. Reported point-to-centre distances are in full-frame pixels after multiplying reduced coordinates by the reduction factor. They are for diagnosis only, with no classification cutoff and no control-flow influence. Ranked triples are shown before the existing top-six selection. Locate events list emitted sizes, subsequent estimates and retry deltas; map events include actual budget, source triple and candidate-queue changes. Per-read ordered symbol entries identify straight then mirrored calls, version decoding and size fallback, format results, first failing Reed–Solomon block, zero-data and parse failures. Second-look events retain map lineage and report symbol/format failures. Search completion shows budget and queue state; look entry records scale, inversion mode and strict fallback. Undefined and nonfinite values are explicitly represented in JSON.

Only operations already executed by the baseline are observed; ray, module and pixel sampling are not instrumented. Shadow results cannot by themselves identify why geometry is wrong, prove a fix, or establish WASM instruction-level behaviour. Version/format success is not proof of an accurate map; inspect the associated 177-sized triple distances and failure stages. Later accuracy changes require separate review, conformance and all-port work.

SHA-256: `build.cjs` `c9835ea4b8ac4c064db9d75b1b9e1844f573a02c20eda3e2970ef966c5154edf`; `observer.mjs` `35ba9613d2ff1a8c6fac917b5011c13a2187286959080db06b470a0c373cebee`; `run.mjs` `9005e31945cab1e69f2417ae38fb2ab4f1c9c5fe62fc087e6a607d7216524af3`.

## Diagnosis and bounded recovery

The M4 observer run in `results.jsonl` preserved complete results, finder lists,
Work and input bytes for both frozen cases. Both originally returned no read.

- `perspective-25`: the accurate full-resolution triple is zero-based rank 6,
  outside the six-triple cap. A reduced accurate triple also exists, but its
  search allowance expires before it is located. This identifies an untried
  path, not proof that increasing the cap would decode it. No ranking or cap
  change is included in this recovery.
- `blur-noise-25`: the accurate full-resolution triple is rank 1, with finder
  centres within 0.51 pixels of the generator's centres. Its size estimate is
  165; ordinary neighbouring retries end at 173. Existing corner maps at 169
  and 173 independently decode both version-information copies to version 40
  with zero bit errors. The mismatch rejects those sampled grids.

The privileged `counterfactual.mjs` selected that existing triple and forced
size 177. `counterfactual-results.jsonl` shows that every ordinary 177 map
still missed: size correction alone was insufficient. This is not a proposed
production selector and uses knowledge of the frozen fixture.

The final privileged follow-through, `counterfactual-second.mjs`, used only
candidates actually queued by those ordinary 177 reads. `second-results.json`
records one normal, non-mirrored M/mask-4 candidate. The unchanged second look
returned exactly `S7PEY3BQ3` and bytes `533750455933425133`; it used one second
look, one mesh and 718,750 recorded probe points. The scratch counterfactual
used the existing full-size non-strict rule; it did not measure production
latency or constitute a complete frame-budget measurement (`maps` was not
charged by this isolated helper).

The resulting production design has no privileged triple or size. It retains
at most four first-seen, deduplicated full-resolution hints only when the
format copies agree and both BCH version copies independently agree on a
mismatching version. Only after all prior searches and second looks fail does
it relocalise those saved triples at their evidence-derived sizes. Recovery
requires strict format agreement, shares the remaining 720-map/four-second-look
frame caps, adds a local 30-map limit, and collects no new hints. Grid decoding
and ordinary symbol-version rules are unchanged.

The authorised M4 run passed all three focused TypeScript tests, including the
actual complete production path under its stricter gate, the exact frozen grey
hash, independent BCH corruption/disagreement cases, and rejection after both
format copies are erased. The official conformance generator adds this same
photograph as `version-hint-blur-40`, making the real recovery path available to
Kotlin and Rust parity tests. At this README checkpoint, full multiport,
photographic, corpus, package and release qualification is still pending;
consult the later release receipts for final results. No broad accuracy or
latency claim follows from this single fixture.
