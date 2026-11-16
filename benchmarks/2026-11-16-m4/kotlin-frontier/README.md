# Kotlin alignment merge frontier

Accepted exact-execution optimisation against baseline
`fabe7f295c6ceffecb96f62d4585a59784838c8c`. `candidate.patch` contains the
measured production change and six focused tests. The integrated Kotlin files
are byte-identical to the measured files; the accompanying SPEC change extends
the existing Rust equivalence note to Kotlin. No vectors, lookup ordering,
weighted updates, final sorting or work counts change.

An ordered primitive ID array limits merge lookup to candidates that can still
match a later observation. The complete candidate history is retained. The
retirement bound and proof are the same as the accepted
[Rust frontier](../alignment-frontier/README.md). This port uses no additional
runtime dependency or boxed ID list.

## Paired M4 measurements

Apple M4 Max, native aarch64 Homebrew OpenJDK 21.0.11, 512 MiB JVM heap.
Two separate JVM forks run serially. Each frame has at least 200 alternating
warm-up pairs and two seconds of warm-up, followed by 60 measured pairs.
Complete result fields, coordinate bits, text, bytes and unchanged input hashes
are checked outside timing and allocation brackets. Source jar ownership is
checked through isolated class loaders. Raw samples and harness hashes are in
`kotlin-frontier-paired-1.json` and `kotlin-frontier-paired-2.json`.

| Workload | Baseline median, forks 1 / 2 (ms) | Candidate median, forks 1 / 2 (ms) | Change, forks 1 / 2 |
|---|---:|---:|---:|
| Clean 720p | 1.064 / 1.064 | 1.062 / 1.059 | −0.2% / −0.5% |
| Blank 720p | 0.507 / 0.494 | 0.511 / 0.494 | +0.8% / −0.1% |
| Noise 1280×720 | 42.734 / 41.657 | 40.767 / 41.103 | −4.6% / −1.3% |
| Noise 512×512 | 34.325 / 34.854 | 32.490 / 32.640 | −5.3% / −6.4% |
| Noise 1920×1080 | 48.775 / 49.179 | 48.439 / 48.658 | −0.7% / −1.1% |
| Stripes | 7.735 / 7.503 | 7.513 / 7.491 | −2.9% / −0.2% |
| Checkerboard | 6.154 / 6.163 | 6.182 / 6.169 | +0.5% / +0.1% |

The main-noise gain varies between forks, so neither 4.6% nor the mean is a
universal speedup. The second fork's striped-frame p95 rises from 7.783 to
8.172 ms (5.0%), while the first falls from 7.799 to 7.651 ms. Noise p95 improves
in both forks at all three resolutions. Clean/blank/checkerboard medians remain
effectively neutral. Acceptance is based on repeated noise improvement with
preserved results; the tail variation remains visible.

| Workload | Baseline allocated bytes | Candidate allocated bytes | Increase |
|---|---:|---:|---:|
| Clean | 1,183,728 | 1,183,808 | 80 (0.007%) |
| Noise 1280×720 | 12,316,640 | 12,354,112 | 37,472 (0.30%) |
| Noise 512×512 | 8,867,800 | 8,906,376 | 38,576 (0.44%) |
| Noise 1920×1080 | 16,261,720 | 16,280,680 | 18,960 (0.12%) |

Blank, stripes and checkerboard allocations are unchanged. These are allocated
bytes per decode, not retained heap or peak memory. Both forks report the same
allocation medians.

## Correctness and identities

`QR_REQUIRE_PHOTOS=1 ./gradlew :core:test :core:jar --console=plain --no-daemon
--max-workers=2` passed all 118 tests, with zero skips, failures or errors.
The six added tests cover all 65,536 binary 4×4 images, 1,200 random clipped
windows and their inverses with shared edges, primitive-array growth, unusual
scales, earliest-match/weighted-drift/retirement boundaries, and four thin-centre
decode fixtures. A copied baseline implementation provides independent lookup
results and work counts. Photographs retain 179/184 correct reads with no wrong
text or lost known reads. The test oracle's 159/184 is ZXing Java 3.5.3 on this
test path; it is not the ZXing-WASM headline score or a new rival speed result.

The baseline and candidate identity JSON files record jar and source hashes;
source hashes concatenate sorted Kotlin paths relative to
`kotlin/core/src/main/kotlin`, each UTF-8 path immediately followed by its bytes.
The candidate patch SHA-256 is
`6d91c107fb6099be48ca21254bd75555eabbff31116d492f673b6d1fd07ac34b`.
Jar hashes identify the actual timed artefacts; rebuilding a jar may change
archive metadata, so source identity is retained separately.

## Reproduction

Build the baseline jar from the named clean revision using `:core:jar`, copy it
outside the checkout, apply `candidate.patch`, run the required tests and build
the candidate jar, then copy it outside the checkout too. Use the worktree's
existing Gradle cache. With `JAVA_HOME` pointing to the recorded Java runtime,
run the following twice in separate serial Gradle invocations:

```sh
cd kotlin
./gradlew :core:compareQrJars --console=plain --no-daemon --max-workers=2 \
  -PqrBaselineJar=/absolute/path/qr-kotlin-before-frontier.jar \
  -PqrCurrentJar=/absolute/path/qr-kotlin-frontier.jar \
  -PqrBenchmarkOutput=/absolute/path/paired-fork.json
```

Use distinct output names. The fresh 256-case held-out corpus was not decoded.
No physical camera, Android runtime, battery or universal superiority claim is
established by these JVM measurements.
