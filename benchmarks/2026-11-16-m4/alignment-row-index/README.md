# Alignment row observation

The resulting compact-mask prototype preserved the checked results but made
all seven noise workloads slower in both M4 processes. It was rejected. See
`prototype.md`, `prototype.patch`, `paired1.json` and `paired2.json`; the
following tools record the accounting that motivated that experiment.

Pinned commit 497d12a91742899fe8ed2801c81bd720398cb94c. Source hash (sorted `.ts` filename + bytes) f0ab875c24cd74649a8e3635528f885e920567da8522649c05ed123f3da1ef01. This is observation only; it does not skip work or implement an index. The four thin-centre frames are engineering regressions, not the unevaluated fresh corpus.

```
node build.cjs /path/to/qr /tmp/alignment-generated
node run.mjs /path/to/qr /tmp/alignment-generated > /tmp/alignment-receipt.jsonl
node exhaustive.mjs
```

Runner asserts complete decode result and work equality against the independently transpiled baseline, and hashes each input frame. Observer is keyed by actual BitImage identity plus row, and alternatively by that identity plus finder-triple array identity and row; no reuse is assumed across images or polarities. Full runs ending at image edges are complete; left/right/both refer only to window clipping. Interior identities use the middle-dark edge index. The minmax and counts histograms represent visits, not distinct entries. The eligible-per-query histogram includes clipped candidates; eligibleMax and interiorEligible exclude them.

Whole-row and 64-pixel touched-chunk counts charge every complete row triple whose dark start falls in a chunk touched by a window; the after-first variant charges chunks encountered only from the second query for each scope. First-query visits remain baseline work. Counts are cumulative, not peak resident entries. Estimated bytes assume 16 bytes per triple, omit row/chunk metadata, postings, temporary merge storage, allocations and query overhead, and do not establish a feasible implementation. A 64-pixel chunk crossing a run needs sufficient neighbouring edge data to reconstruct the full adjacent light runs. Enumerating eligible triples still needs original horizontal order, with clipped boundaries separately inserted in order, and longer runs must use an exact fallback. No elapsed-time result or speed claim is implied.

The exhaustive independent binary-row oracle checks 89,076 combinations of widths 1–8, all bit patterns and windows, and six wide values. It compares ordered triples and eligibility, including image edges. The existing corpus includes two baseline-unreadable fractional blurred examples; equality is not proof of new successful reads. The receipt includes all result and work fields, observed distributions and frame hashes.

The supplemental receipt adds per-scope row query histograms and touched chunk counts, plus a per-query count of distinct `(min,max)` buckets among eligible interior triples. This fan-in counts realised nonempty buckets, not all buckets a hypothetical query would need to inspect. The same 28 result/work comparisons were rerun. Only this complete receipt is retained here.
