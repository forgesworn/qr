Two independent paired processes per backend ran sequentially on the Apple M4 Max with native Node 24.21.0. Each covers 47 cases with 60 alternating measured pairs after at least ten warm-up pairs and 500 ms. Assertions and input hashing run outside the timed decoder call.

| Case | WASM 0.3.11 median range | WASM 0.3.12 median range | Median change, fork 1 / 2 | p95 change, fork 1 / 2 |
|---|---:|---:|---:|---:|
| starvation-holdout-54 | 18.80–18.87 ms, miss | 18.76–18.80 ms, read | -0.21% and -0.34% | -0.00 ms and +0.01 ms |
| admission-holdout-122 | 21.29–21.39 ms, miss | 21.34–21.40 ms, read | +0.21% and +0.03% | +0.18 ms and -0.01 ms |
| late-phase-holdout-6 | 9.32–9.42 ms, miss | 9.33–9.41 ms, read | +0.03% and -0.11% | -0.06 ms and -0.05 ms |
| version-peer-holdout-87 | 28.89–28.91 ms, miss | 28.95–29.00 ms, read | +0.19% and +0.32% | +0.13 ms and +0.13 ms |
| header-rediscovery-holdout-54 | 18.75–18.85 ms, miss | 18.73–18.85 ms, read | -0.00% and -0.14% | +0.00 ms and +0.11 ms |
| boundary-unseen-95 | 89.76–89.80 ms, miss | 89.67–89.78 ms, miss | -0.14% and +0.01% | -0.32 ms and +0.34 ms |
| starvation-holdout-42 | 14.45–14.56 ms, miss | 14.38–14.50 ms, miss | -0.49% and -0.40% | +0.00 ms and -0.03 ms |
| alternate-grid-holdout-125 | 76.38–76.46 ms, miss | 75.93–76.14 ms, miss | -0.58% and -0.42% | -0.61 ms and +0.10 ms |

WASM: the five measured new reads change by -0.34–0.32% relative to earlier misses; the three actual selected-header misses change by -0.58–0.01%. Earlier successful curved cases change by -0.88–1.46%. These subsets are separate; all eleven accuracy gains are covered by the full qualification.

WASM clean: median changes +1.14% and +0.52%; p95 changes -0.01 ms and -0.01 ms.

WASM blank: median changes +0.86% and -0.02%; p95 changes +0.01 ms and -0.01 ms.

WASM noise: median changes -0.06% and -0.03%; p95 changes -0.05 ms and +0.12 ms.

| Case | TypeScript 0.3.11 median range | TypeScript 0.3.12 median range | Median change, fork 1 / 2 | p95 change, fork 1 / 2 |
|---|---:|---:|---:|---:|
| starvation-holdout-54 | 43.56–43.70 ms, miss | 43.75–44.00 ms, read | +0.11% and +1.01% | +0.29 ms and +0.39 ms |
| admission-holdout-122 | 47.47–47.59 ms, miss | 47.89–47.92 ms, read | +0.70% and +0.88% | -0.63 ms and -0.47 ms |
| late-phase-holdout-6 | 23.39–23.48 ms, miss | 23.41–23.49 ms, read | +0.11% and +0.07% | +0.25 ms and +0.12 ms |
| version-peer-holdout-87 | 68.39–68.62 ms, miss | 68.69–69.03 ms, read | +0.43% and +0.60% | +0.92 ms and -0.22 ms |
| header-rediscovery-holdout-54 | 43.32–43.53 ms, miss | 43.63–43.71 ms, read | +0.22% and +0.91% | +0.09 ms and +0.23 ms |
| boundary-unseen-95 | 212.22–212.65 ms, miss | 212.15–212.49 ms, miss | -0.24% and +0.13% | -0.16 ms and +0.03 ms |
| starvation-holdout-42 | 34.66–34.79 ms, miss | 34.80–34.92 ms, miss | +0.42% and +0.37% | +0.22 ms and -0.01 ms |
| alternate-grid-holdout-125 | 178.64–179.60 ms, miss | 179.09–179.88 ms, miss | +0.25% and +0.16% | +1.89 ms and +3.75 ms |

TypeScript: the five measured new reads change by 0.07–1.01% relative to earlier misses; the three actual selected-header misses change by -0.24–0.42%. Earlier successful curved cases change by -0.94–1.13%. These subsets are separate; all eleven accuracy gains are covered by the full qualification.

TypeScript clean: median changes -0.46% and -1.38%; p95 changes +0.39 ms and -0.97 ms.

TypeScript blank: median changes +0.02% and +0.14%; p95 changes +0.52 ms and +0.23 ms.

TypeScript noise: median changes -0.06% and -0.52%; p95 changes +0.51 ms and +0.18 ms.

Paired WASM final baseline/candidate linear-memory capacities: 14,483,456/14,483,456 bytes; 14,483,456/14,483,456 bytes. Capacity is not peak live allocation. Unchanged Work counts do not measure the extra header/symbol-validation CPU cost. These samples do not establish a general speed improvement, mobile latency or a worst-case time bound.

| Fixed 1280 × 720 RGBA frame | QR 0.3.12 WASM median | ZXing-WASM 3.1.7 median | QR / ZXing p95 ranges |
|---|---:|---:|---:|
| clean | 1.521–1.526 ms | 1.889–1.896 ms | 1.557–1.563 / 1.961–2.095 ms |
| blank | 1.167–1.180 ms | 2.118–2.137 ms | 1.186–1.205 / 2.150–2.163 ms |
| noise | 20.265–20.303 ms | 7.703–7.729 ms | 20.516–20.794 / 7.815–7.905 ms |
