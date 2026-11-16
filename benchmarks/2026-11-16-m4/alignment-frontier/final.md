# Alignment merge frontier: readable candidate

Baseline: `60cf67acd180f0a5968856cb9e0fd2f518d63322`. The measured candidate is retained as `prototype.patch` alongside its receipts. This separate snapshot expands the added Rust helpers and tests, adds proof comments and the SPEC equivalence paragraph. Production Rust tokens match the measured snapshot after stripping comments and whitespace; no algorithm variant is included. `measured-to-final.patch` exposes the complete delta, including test formatting and SPEC. `final.patch` applies against the pinned baseline.

SHA-256:

- `rust/src/place.rs`: `f34ba265cc7c4dc844f980390922cccea70cf020c07c68a51198c7e8fdfad686`
- `rust/src/decode.rs`: `25637752984a9c8b370fcd6c963b87a65aa22cfa3b76efbead56885180138903`
- `SPEC.md`: `d0f8d4910669d128db91f09d813b2754a8c538d57efac4b18101acc4b5d4ef30`
- `final.patch`: `910e4b2097bf6d640c674cf3e061f213547fd92f25da1ca83dcc09ffbba7943f`
- `measured-to-final.patch`: `86c29a1ced89e06737fd12187017c29176d07d0d599263dc2632086560cadeb4`
- Measured candidate baseline patch: `fd82aea86fea7cbef3381fe2c99c4670017ac1843828ee8b791eb337d78df9ae`

The added tests cover historical full-scan comparison, 4×4 binary images with a nonempty-result assertion, random windows, frontier drift and retirement boundaries, shared normal/inverse edges, complete location output and work, and four thin-centre fixtures. Test results on the measured snapshot do not establish this newly formatted snapshot's build or performance. At the source handoff, no local compilation or tests had run; its target symlink was deliberately left dangling. The coordinator subsequently completed the M4 build, verification and two-fork timing gate recorded below.

## Accepted final M4 build

All 37 native Rust tests passed with `--all-features`, Rust 1.94.1,
`CARGO_INCREMENTAL=0` and the x86_64 compiler host. The final host-text WASM is
212,865 bytes, SHA-256
`d41c7e06bd693c51cb4c3f7fbb4df1a79ae6853aa58b2160b1817fb739fc427d`;
packaged source SHA-256 is
`a43edbf3ef64068394fc5b055b4c161354a4868a68eef78ebf49c3f73466d7fa`.
The normal build script reproduced the manually timed binary byte-for-byte.
Both final 89-case ABI and 184-photo comparisons passed, retaining 179 correct
photo reads, zero lost reads and zero wrong text. The integrated package then
passed typechecking, all 462 JavaScript tests with `QR_REQUIRE_PHOTOS=1`, and
`npm run check:package` (actual packed entry, WASM, full results and disposal).
Chrome 157 page/worker, six character-set cases and tracked-session checks also
passed on this exact binary; see `frontier-browser.json`. The runner closes its
local server/browser and removes its temporary profile.

Two independent native arm64 Node processes measured the final binary against
the accepted pre-frontier baseline:

| Workload | Baseline median ms, two forks | Final median ms, two forks | Interpretation |
|---|---:|---:|---|
| Main 720p noise | 19.993 / 20.285 | 19.711 / 19.914 | 1.4–1.8% lower latency |
| Five other noise cases | See receipts | See receipts | 0.5–2.4% lower in both forks |
| 1080p noise, seed 49ad7e32 | 25.577 / 25.954 | 25.640 / 25.850 | Neutral: +0.2% / −0.4% |
| Clean | 1.548 / 1.569 | 1.567 / 1.572 | +1.2% / +0.1% |
| Blank | 1.180 / 1.188 | 1.200 / 1.191 | +1.7% / +0.2% |
| Stripes | 7.474 / 7.507 | 7.486 / 7.524 | About +0.2% in both |
| Checkerboard | 6.232 / 6.222 | 6.229 / 6.228 | Within 0.1% |
| Gradient | 4.128 / 4.134 | 4.185 / 4.141 | +1.4% / +0.2% |

Stripes p95 changed from 7.716/7.618 to 7.575/7.683 ms; the earlier material
pattern slowdown was not reproduced. Small clean/blank/gradient changes remain
visible above. Accept this as a modest noise optimisation, not universal
acceleration or a new claim against ZXing. Full samples, input/harness identities
and p95 values are in `frontier-final-paired1.json` and
`frontier-final-paired2.json`. Only this final source/binary is integrated;
the measured prototype remains separately archived.
