# Uncounted packaged decode: rejected

The disposable candidate changes only the `read_picture` call from
`Some(&mut work)` to the decoder's existing `None` option. It is based on
`d6bc8d26517f713f10d8adde7ef4bc34ef19154d`. Its raw counter exports intentionally
become zero, so this module cannot replace the existing raw ABI. No adapter,
ABI-version, required export, public option, algorithm, allowance, SPEC or
vector change is accepted. Production retains the counted path.

The packaged JavaScript adapter never reads those counters, which motivated
this cross-stage diagnostic. Removing the only full counted decode entry can
also affect compiler optimisation globally; even a positive diagnostic would
have required a separately qualified implementation retaining the counted ABI.
The existing low-level `decode` export already uses `None`, but returns only a
payload length, so it is not a substitute for complete-result comparison.

The exact Rust 1.96.0 candidate is 207,122 bytes, SHA-256
`28a662e2f120695ecb11b90e896b907f2e2360bfc6b4f9922fdfe0e18a82b0dc`.
The baseline is the accepted 207,214-byte `1b0367` module. All 89 complete
public ABI-result comparisons and all 184 photograph comparisons pass,
including unchanged input hashes: 179 correct photographs, zero lost reads and
zero wrong text. Those checks do not validate the deliberately broken raw Work
contract. No native-test claim is made for this WASM-only exported-call change.

One serial native-arm64 Node 24.21.0 paired negative matrix uses at least 20
warmup pairs and one second per fixture, then 60 alternating pairs. Complete
results and input hashes are checked outside timing. The main noise case is
neutral and additional noisy cases have small mixed changes. This fails the
screening gate for a material broad noise improvement; no second fork,
production uncounted export or specialisation variants are pursued.

| Workload | Baseline median ms | Candidate median ms | Change |
|---|---:|---:|---:|
| Clean 720p | 1.579 | 1.551 | −1.8% |
| Blank 720p | 1.187 | 1.181 | −0.5% |
| Main noise 720p | 20.452 | 20.454 | +0.01% |
| Noise 512², seed 49ad7e32 | 15.588 | 15.522 | −0.4% |
| Noise 512², seed fe13bc9 | 15.663 | 15.757 | +0.6% |
| Noise 720p, seed 49ad7e32 | 16.677 | 16.501 | −1.1% |
| Noise 720p, seed fe13bc9 | 17.003 | 16.918 | −0.5% |
| Noise 1080p, seed 49ad7e32 | 26.164 | 26.038 | −0.5% |
| Noise 1080p, seed fe13bc9 | 28.308 | 28.465 | +0.6% |
| Stripes | 7.914 | 7.881 | −0.4% |
| Checkerboard | 6.604 | 6.497 | −1.6% |
| Gradient | 4.032 | 4.057 | +0.6% |

Clean p95 worsens (1.746→1.829 ms), and other tails are mixed. The small clean
and checkerboard median differences in one fork do not justify ABI complexity
or establish repeatable gains. The accepted packaged module remains unchanged.

## Reproduction

Apply `prototype.patch` to the pinned source in a scratch checkout named `repo`.
Copy `build-uncounted.mjs` into its parent, select the pinned Rust 1.96 compiler
and run it there using the checkout's existing target. It writes a disposable
module outside the checkout and leaves the packaged baseline untouched.
Generate the existing scored-blocks fixtures with that archive's builder.
Run `alignment-row-index/check-candidate.mjs`, `finder-events/check-photos.mjs`
and `scripts/compare-wasm.mjs --negative` against the two modules, with the
same explicit repository/generated/candidate arguments as those tools document.
The binary and scratch copies are removed after the source, identities and
receipts are archived. The fresh 256-case corpus remains untouched.
