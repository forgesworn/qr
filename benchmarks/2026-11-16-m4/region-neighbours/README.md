# Rejected neighbouring-row filters

Neither prototype is production code. The initial filter passes 272 existing
cases but loses valid one-pixel finder centres. Its thin-centre recovery passes
those cases and then loses valid two-pixel finder centres. Public regressions
in `test/finder-damage.test.ts` preserve both cases in TypeScript and packaged
WASM. No detector-policy or vector changes were adopted.

The diagnostic pins source `cbc54db`; both filters pin `8fd581b`. Builders take
an explicit repository path and scratch output directory, and read the pinned
Git sources. Runners compare baseline, plain candidate and a separately
instrumented candidate. The ordinary filter runner requires the repository's
hash-verified photographic cache (`npm run fetch-photos`).

```sh
node filter/build.cjs /path/to/qr /tmp/region-filter
node filter/run.mjs /path/to/qr /tmp/region-filter > /tmp/filter-results.jsonl
node filter/falsifier.mjs /tmp/region-filter
node thin-repair/build.cjs /path/to/qr /tmp/region-thin
node thin-repair/run.mjs /path/to/qr /tmp/region-thin > /tmp/thin-results.jsonl
node thin-repair/two-pixel-falsifier.mjs /tmp/region-thin /tmp/region-filter
```

Sorted JavaScript filename/content hashes:

- Baseline: `3b43bbf7f6f4ebe260a3b1c2ea1b413e7546401363d3b04e526663b76a8410c5`.
- Initial filter: `45697b9c38d4851990644a0c977b618bb7731480aa9c3fcecff9e86e0e516db9`.
- Thin-centre repair: `0f448c3a14c336b926bf6fae617909b94dd40192795866c7c54b7fc4668b8a21`.

Only the initial filter was timed on M4. Its paired receipt includes the exact
builds, harness, input hashes and raw samples. It cuts main 720p noise time by
33%, but slows two other noise cases by 7.5% and 6.6%. The recovery variant was
not timed because a second valid-read regression rejected it first.

The diagnostic reports optimistic baseline work attribution, not actual
performance. Filtering the ranked triples before the six-triple cap can expose
later triples and passes, so reduced alignment work need not reduce total work.
