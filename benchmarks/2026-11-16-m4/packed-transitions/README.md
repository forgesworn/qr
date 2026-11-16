# Packed transition words: closed after screening

Pinned revision `104b731868c82d00b6f31a9a853db786b2fd971a`. This observer keeps the original coordinate arrays, search, Work and outputs in control. It models one fixed representation: one u64 bit per x where adjacent bytes differ, x=0 always clear, and `ceil(width/64)*8` logical bytes for every constructed row. It never accesses the fresh 256-case corpus.

```sh
node /path/to/diagnostic/build.cjs /path/to/qr /tmp/transitions-generated
node /path/to/diagnostic/edge-oracle.mjs /tmp/transitions-generated > /tmp/transitions-oracle.json
node /path/to/diagnostic/run.mjs /path/to/qr /tmp/transitions-generated > /tmp/transitions-receipt.jsonl
```

The explicit repo supplies the pinned Git objects and installed TypeScript; the output directory contains copied source, fixtures and generated modules. The runner derives from the committed 38-case budget-dead runner and preserves its frame set, including six negative seed/size cases, patterns, clean/blank, bent, damaged and all four thin-centre cases. It compares complete result, finder lists and every Work field, and verifies the input bytes after both decodes. Hashes identify source, fixture helpers, tooling and each frame. The oracle checks original `edgesOf` against direct byte inequality and packed-bit enumeration for widths 1–257, arbitrary bytes, nonzero-offset slices, tail words and xor-1 inverse. It also checks the fixed eight-byte collapse formula below. The root agent executed these checks on M4; results are below.

Construction counts row calls, misses and hits, `width-1` logical adjacent comparisons, transition coordinates and old Rust word-group ctz operations, as well as logical used bytes for Rust's i32 coordinate vector and the alternative fixed-width words. Rust row spans are separately estimated at eight bytes per image row. Cumulative bytes are summed across cache lifetimes; per-cache maxima are not simultaneous-process peaks. Actual Vec capacity, allocation, ABI alignment and scratch memory are unknown and excluded. TS scratch/slice allocations are not charged as Rust costs. Dense bit words cost their full allocation even on blank, clean or gradient rows.

For each eight adjacent-byte comparisons, the constructive ledger charges two word loads and one XOR. The proposed packed collapse is charged unconditionally at three ORs, three shifts, one mask, one wrapping multiply and a final shift per group; tail comparisons, bitmap placement and control/memory costs remain separate. The oracle tests `d |= d >> 4; d |= d >> 2; d |= d >> 1; d &= 0x0101010101010101; packed = wrapping_mul(d, 0x0102040810204080) >> 56` against bytewise inequality. No zero-XOR branch saving is assumed, and the M4 oracle validates this formula over the stated cases. Repeated source-level loads and these operations are not weighted as equal CPU costs; LLVM may hoist or combine loads.

Finder rows record actual visited windows and their original Rust coordinate-source loads, unique versus repeated boundary indices per row, and a hypothetical ascending packed cursor that retains overlapping boundaries without storing row transition counts; it charges terminal zero-word scanning, including no-candidate rows and advances beyond the last transition; its extracted transitions include intervening entries skipped by a successful finder. It records word visits, zero words, masks and distinct/repeated row-word visits. This cursor is a model, not an implemented iterator, and its reuse requires storage. Alignment rows independently replay the pinned Rust binary seek and sequential light/dark boundary schedule, including every original Rust source-coordinate read and unique sequential slot fetch counts. Each emitted run triple is checked in order against the actual TypeScript traversal. Rust retains `light_end` and `dark_end`; TypeScript's different indexed loads are not presented as Rust savings. Window first/last clipping and dark-start skips are recorded.

For alignment packed consumption, the ledger separately models scanning every transition and word in the clipped `(left,right]` range. Those range totals are a conservative over-enumeration for this simple bounded model, not an exact implementation or an upper bound on all possible seek implementations; first/last word masking and clipped-run handling still need engineering. Word visits include zero words, distinct/repeated row-word identities and one illustrative mask each; extraction counts, Rust seeks and sequential accesses are kept separate. No generic scalar total or speed conclusion follows: the representation trades coordinate loads and retained vector memory against construction collapse, words, bit extraction, state, branches and allocations.

Pinned source-directory SHA-256 (sorted `.ts` filenames and bytes) `807a7fa15ed0a2e48b7dcdc53784dedd87f5680a9f33e2bf1221aeab271f2976`; TS `src/locate.ts` `a33c41f2b04532e7c36d87617b9855dcff52a2687912dbc8625297560fdd6d6a`; Rust `locate.rs` `593446fb545e18177b6b000422e9262db26571736a02aa587092f4e5cdeffea2`; Rust `place.rs` `f34ba265cc7c4dc844f980390922cccea70cf020c07c68a51198c7e8fdfad686`.

Tool SHA-256: `build.cjs` `b6decd908b598cd71d92fa661822a2077c5cd00e270dbbd51e6e02f334f6d0f5`; `observer.mjs` `d57e55aecfd4cd9f02b0f0f04ac4a67e398f0492380768562acd412a7de1dfbe`; `run.mjs` `696e432d4e1e867b850392f7cd134c9f999a11c19160786312b68157775fff26`; `edge-oracle.mjs` `8227a3fb5335137c88ad627c05dc917ff0a909e6ab7f6796203ba7ec1dbb5e3d`. Fixture helpers: `photo.ts` `d34ab6f88bce5e26342c07a3868577fd73b080379c605e1fd2e8516f85db7bf4`, `png.ts` `b0f276a4c6d667f504ff9f53bf111ebee31f42412299a22bd3a95b6fc6df9e8e`; original committed fixture runner `40c0e6204203e303889f9708bd9d4f9b678d16cab22f88695f11065a0b4a4c20`.

The preparing agents performed no local builds or tests. The root agent ran the diagnostic serially on M4 with native arm64 Node 24.21.0. No compiled candidate or performance timing was run.


## M4 screening result and decision

All 38 fixtures preserve complete results, finder lists, Work and input hashes.
The edge oracle passes 6,168 row cases, 96,000 eight-byte collapse groups and
2,304 exhaustive position/lane cases. Source identities and frame hashes are
retained in `packed-transition-receipt.jsonl`; the separate oracle receipt
identifies its exact script. Production source and packaged WASM are unchanged.

| Workload | Coordinate storage, bytes | Packed storage, bytes | Old construction ctz | Modelled finder extractions | Alignment extraction range upper |
|---|---:|---:|---:|---:|---:|
| Main noise 720p | 1,928,980 | 121,040 | 478,212 | 800,374 | 460,804 |
| Clean 720p | 8,032 | 46,240 | 2,008 | 1,326 | 269 |
| Negative stripes | 1,213,920 | 76,560 | 299,850 | 1,213,920 | 0 |
| Negative checkerboard | 995,280 | 74,400 | 246,240 | 995,280 | 0 |
| Negative gradient | 444 | 153,120 | 88 | 334 | 0 |
| One-pixel modules in 720p | 312 | 38,400 | 78 | 78 | 0 |
| Two-pixel modules in 720p | 608 | 38,400 | 152 | 152 | 0 |

Storage totals are logical used bytes summed over cache lifetimes, excluding
capacity and separately recorded row spans. They are not measured allocation
or simultaneous peak memory. Counts in the final three columns describe
different operations, not equivalent-cost CPU units.

The fixed-u64 proposal is closed at screening: it does not offer sufficiently
clear broad CPU savings to justify a production prototype. Main-noise storage
falls 93.7%, but finder traversal alone re-extracts 800,374 transitions, before
alignment traversal, versus 478,212 ctz operations in the original one-time row
construction. Packing also adds 119,532 unconditional collapse groups. Of
2,370,661 raw finder coordinate-source loads, only 800,345 are distinct per
row pass; LLVM may already reuse overlapping loads. Reduced storage alone
does not establish a cache bottleneck or latency benefit.

Sparse workloads carry a different cost: clean storage grows 5.76 times and
requires 45,951 collapse groups versus 2,008 old construction ctz operations.
The negative gradient requires 150,660 collapse groups versus 88 old ctz
operations; the small-module examples also expand retained row storage.
Dense patterns repeatedly extract about four times as many boundaries as the
original construction did.

This is a prioritisation decision, not a measured runtime regression or proof
that every packed implementation must be slower. Alignment range counts are
an upper bound, EOF visits are conservative, operation weights are unknown,
and no zero-XOR fast-path benefit is assumed. No density thresholds, hybrid
formats, alternative word widths or production changes are pursued. The
accepted packaged decoder and current rival measurements remain unchanged;
the fresh 256-case corpus remains untouched.
