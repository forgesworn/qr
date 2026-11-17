Two independent paired processes per backend ran sequentially on the Apple M4 Max with native Node 24.21.0. Each covers 40 cases with 60 alternating measured pairs after at least ten warm-up pairs and 500 ms. Assertions and input hashing run outside the timed decoder call.

| Case | WASM 0.3.10 median range | WASM 0.3.11 median range | Paired change |
|---|---:|---:|---:|
| alternate-known-90 | 40.10–40.16 ms, miss | 40.25–40.29 ms, read | +0.47% and +0.22% |
| alternate-previous-40 | 21.50–21.53 ms, miss | 21.59–21.71 ms, read | +0.87% and +0.41% |
| known-version-peer-miss-55 | 36.69–36.82 ms, miss | 36.76–37.00 ms, miss | +0.86% and -0.16% |
| holdout-version-peer-miss-37 | 18.26–18.29 ms, miss | 18.22–18.33 ms, miss | +0.37% and -0.37% |
| fresh-version-peer-miss-45 | 16.16–16.18 ms, miss | 16.08–16.18 ms, miss | -0.00% and -0.50% |
| fresh-version-peer-miss-61 | 25.05–25.07 ms, miss | 25.01–25.15 ms, miss | +0.37% and -0.23% |
| fresh-version-peer-miss-77 | 31.76–31.85 ms, miss | 31.79–31.82 ms, miss | +0.19% and -0.16% |

WASM new-read median changes are 0.22–0.87% relative to their earlier misses; the five existing persistent-miss controls change by -0.50–0.86%. Main-noise medians change by +0.42% and -0.05%, clean by +0.74% and +0.44%, and blank by -1.18% and -0.29%. Existing curved-success median changes range from -0.39% to +0.81%. Clean p95 changes by -0.00 ms and +0.01 ms. These results do not establish a general speed improvement.

TypeScript new-read median changes are 0.06–0.64% relative to their earlier misses; the five existing persistent-miss controls change by -0.60–0.53%. Main-noise medians change by +0.25% and -0.55%, clean by -3.48% and +1.38%, and blank by +0.15% and -0.32%. Existing curved-success median changes range from -1.30% to +1.28%. Clean p95 changes by -0.20 ms and +0.05 ms. These results do not establish a general speed improvement.

The paired WASM runs finish with baseline/candidate linear-memory capacities of 14,483,456/14,483,456 bytes; 14,483,456/14,483,456 bytes. Capacity is not peak live allocation. Raw samples and p95 values are retained. Desktop measurements do not establish mobile latency or worst-case time bounds.

| Fixed frame | QR 0.3.11 WASM median | ZXing-WASM 3.1.7 median |
|---|---:|---:|
| Clean QR | 1.517–1.519 ms | 1.892–1.896 ms |
| Blank | 1.161–1.165 ms | 2.125–2.129 ms |
| Random noise, no QR | 20.334–20.342 ms | 7.739–7.742 ms |

WASM median changes for the two new reads range from +0.22% to +0.87% relative to the earlier misses. Existing successful-case median changes range from -0.39% to +0.81%. These measurements do not establish a general speed improvement or the worst-case extra symbol-validation cost.
