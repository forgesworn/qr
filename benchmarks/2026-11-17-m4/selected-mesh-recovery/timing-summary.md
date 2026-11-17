Two independent paired processes per backend ran sequentially on the Apple M4 Max with native Node 24.21.0. Each covers 51 cases with 60 alternating measured pairs after at least ten warm-up pairs and 500 ms. Assertions and input hashing run outside the timed decoder call.

| Case | WASM 0.3.12 median range | WASM 0.3.13 median range | Median change, fork 1 / 2 | p95 change, fork 1 / 2 |
|---|---:|---:|---:|---:|
| starvation-holdout-42 | 14.42–14.43 ms, miss | 14.46–14.50 ms, read | +0.33% and +0.54% | -0.02 ms and +0.05 ms |
| late-phase-holdout-111 | 47.34–47.36 ms, miss | 47.71–47.76 ms, read | +0.74% and +0.89% | +0.45 ms and +0.42 ms |
| version-peer-holdout-58 | 18.24–18.26 ms, miss | 18.34–18.35 ms, read | +0.43% and +0.61% | +0.20 ms and +0.17 ms |
| header-rediscovery-holdout-46 | 19.21–19.26 ms, miss | 19.30–19.31 ms, read | +0.19% and +0.53% | +0.18 ms and +0.10 ms |
| selected-mesh-holdout-39 | 25.50–25.51 ms, miss | 25.62–25.65 ms, read | +0.45% and +0.57% | +0.11 ms and +0.16 ms |
| boundary-unseen-95 | 89.68–89.71 ms, miss | 89.54–89.85 ms, miss | -0.19% and +0.19% | -0.27 ms and -0.06 ms |
| alternate-grid-holdout-125 | 75.89–76.20 ms, miss | 76.02–76.19 ms, miss | -0.24% and +0.40% | -0.05 ms and +0.19 ms |

WASM: the five measured new reads change by 0.19–0.89% relative to earlier misses; the two actual selected-mesh misses change by -0.24–0.40%. Earlier successful curved cases change by -0.45–0.84%. These subsets are separate; all five accuracy gains are covered by the full qualification. Changes compare the medians within each fork, not the median of paired per-call percentage changes.

WASM clean: median changes +0.03% and +0.36%; p95 changes +0.00 ms and -0.01 ms.

WASM blank: median changes -1.47% and -0.87%; p95 changes -0.02 ms and -0.01 ms.

WASM noise: median changes +0.02% and +0.21%; p95 changes +0.11 ms and +0.08 ms.

| Case | TypeScript 0.3.12 median range | TypeScript 0.3.13 median range | Median change, fork 1 / 2 | p95 change, fork 1 / 2 |
|---|---:|---:|---:|---:|
| starvation-holdout-42 | 34.96–34.98 ms, miss | 35.14–35.30 ms, read | +0.52% and +0.92% | -0.14 ms and +0.23 ms |
| late-phase-holdout-111 | 115.64–116.54 ms, miss | 116.06–117.47 ms, read | +0.80% and +0.37% | +0.52 ms and +5.02 ms |
| version-peer-holdout-58 | 43.63–43.69 ms, miss | 43.74–43.80 ms, read | +0.38% and +0.11% | +0.32 ms and -0.09 ms |
| header-rediscovery-holdout-46 | 46.00–46.46 ms, miss | 45.89–46.21 ms, read | -0.53% and -0.24% | -0.01 ms and +0.37 ms |
| selected-mesh-holdout-39 | 61.65–62.37 ms, miss | 61.80–62.08 ms, read | -0.47% and +0.25% | +0.19 ms and +0.25 ms |
| boundary-unseen-95 | 212.46–212.57 ms, miss | 212.32–213.25 ms, miss | -0.07% and +0.32% | +1.68 ms and -0.29 ms |
| alternate-grid-holdout-125 | 178.80–179.37 ms, miss | 178.42–179.40 ms, miss | +0.34% and -0.53% | -0.22 ms and +0.34 ms |

TypeScript: the five measured new reads change by -0.53–0.92% relative to earlier misses; the two actual selected-mesh misses change by -0.53–0.34%. Earlier successful curved cases change by -0.89–0.93%. These subsets are separate; all five accuracy gains are covered by the full qualification. Changes compare the medians within each fork, not the median of paired per-call percentage changes.

TypeScript clean: median changes +6.15% and +3.77%; p95 changes +0.64 ms and +0.16 ms.

TypeScript blank: median changes +4.78% and +4.32%; p95 changes +0.12 ms and -0.03 ms.

TypeScript noise: median changes -0.07% and +0.06%; p95 changes +0.74 ms and -0.17 ms.

Paired WASM final baseline/candidate linear-memory capacities: 14,483,456/14,483,456 bytes; 14,483,456/14,483,456 bytes. Capacity is not peak live allocation. Unchanged Work counts do not measure the extra strict mesh-grid symbol-validation CPU cost. These samples do not establish a general speed improvement, mobile latency or a worst-case time bound.

| Fixed 1280 × 720 RGBA frame | QR 0.3.13 WASM median | ZXing-WASM 3.1.7 median | QR / ZXing p95 ranges |
|---|---:|---:|---:|
| clean | 1.519–1.545 ms | 1.882–1.892 ms | 1.549–1.638 / 2.006–2.068 ms |
| blank | 1.172–1.181 ms | 2.109–2.120 ms | 1.192–1.197 / 2.149–2.156 ms |
| noise | 20.273–20.419 ms | 7.689–7.749 ms | 20.732–20.820 / 7.862–7.918 ms |
