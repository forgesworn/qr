# Fresh 160 one-shot qualification

Root only. Run after the candidate is frozen and known-perspective, 39 engineering cases and all existing regression gates pass. The explicit `--qualified` flag attests those gates; the two environment hashes bind that attestation to the exact independently hashed JavaScript build directories. This runner does not itself validate or execute those preceding gates. The fresh set becomes evaluated regression evidence after any decoder is invoked.

```
QR_EXPECT_BASE_SHA256=<64-hex-base-directory-hash> \
QR_EXPECT_CANDIDATE_SHA256=<64-hex-candidate-directory-hash> \
node /tmp/qr-overflow-fresh-evaluation-c6f05a9/run.mjs <repo> <generated-build-dir> <fresh160-dir> <rivals-dir> <new-output.json> --qualified
```

The output path is exclusively reserved before fixture materialisation or decoder loading; failure can leave an empty marker. The runner verifies all 160 frozen metadata records and grey hashes before loading decoders. For each frame all three readers see the same RGBA and their input is hashed after each read. It writes every exact text/UTF-8-byte positive and negative-control outcome before returning failure if the candidate loses a baseline correct result or emits a wrong/false result. It makes no latency or universal superiority claim. Throwaway synthetic payloads are recorded. The builder's `identity.json` is recorded alongside independently verified build hashes.
