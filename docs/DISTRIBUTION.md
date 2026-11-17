# Distribution

The JavaScript/TypeScript and optional WebAssembly backends share the npm
package `@forgesworn/qr`. The native Rust crate is `forgesworn-qr`, and Kotlin is
published on Maven Central as `io.github.forgesworn:qr`. The 0.3.9 release
aligns npm, JSR, Rust and Kotlin on one version. JSR 0.3.1 was a packaging-only
fix for the 0.3.0 library; its version number is not reused.

| Channel | What it provides |
|---|---|
| [npm](https://www.npmjs.com/package/@forgesworn/qr) | Versioned ESM, declarations, optional WASM and documentation |
| [GitHub releases](https://github.com/forgesworn/qr/releases) | Release notes, source snapshots and npm integrity/provenance information |
| [Documentation](https://forgesworn.github.io/qr/) | Guide, API, comparison, specification and machine-readable text |
| [jsDelivr](https://www.jsdelivr.com/package/npm/@forgesworn/qr) | CDN distribution of the npm package |
| [UNPKG](https://unpkg.com/@forgesworn/qr/) | CDN distribution of the npm package |
| [JSR](https://jsr.io/@forgesworn/qr) | TypeScript sources, generated API documentation and optional WASM |
| [Maven Central](https://central.sonatype.com/artifact/io.github.forgesworn/qr) | Kotlin/JVM 17 library, sources and API documentation; Kotlin standard library required |
| [crates.io](https://crates.io/crates/forgesworn-qr) | Native Rust source crate, no runtime dependencies, Rust 1.96+ |
| [docs.rs](https://docs.rs/forgesworn-qr) | Rust API documentation and tested usage examples |

CDNs are third-party delivery services. Pin an exact version for production and
prefer self-hosting assets where you need control over availability and privacy.
The library itself never fetches an asset automatically.

## Install and pin

```sh
npm install --save-exact @forgesworn/qr@0.3.9
# Equivalent: pnpm add --save-exact @forgesworn/qr@0.3.9
# Equivalent: yarn add --exact @forgesworn/qr@0.3.9
```

Use `import` with Node 22.13+ or an ES2022-capable browser/bundler. The ordinary
entry point has no WebAssembly initialisation requirement. Import the optional
backend from `@forgesworn/qr/wasm` and supply the bundled module bytes explicitly.

## JSR installation

```sh
deno add jsr:@forgesworn/qr@0.3.9
```

```ts
import { encode, decode } from 'jsr:@forgesworn/qr@0.3.9'
import { loadWasm, wasmUrl } from 'jsr:@forgesworn/qr@0.3.9/wasm'
```

The JSR package has the same API as npm. Supply WASM bytes explicitly when using
that backend. Keep npm as the normal installation route for Node and bundlers.
Deno may defer a newly published version under its minimum dependency age policy.
Our release consumer uses a per-command age override for the exact dependency-free
version, after checking its registry hashes and recorded provenance.

## Kotlin installation

For Kotlin with Gradle:

```kotlin
repositories { mavenCentral() }
dependencies { implementation("io.github.forgesworn:qr:0.3.9") }
```

Import `dev.forgesworn.qr.*`. JVM 17 is required; only the Kotlin standard
library is a runtime dependency. The Maven group and Kotlin package differ.

## Native Rust

```sh
cargo add forgesworn-qr@0.3.9
```

See the [Rust guide](../rust/README.md) for API contracts, pixel layout and
character-set differences. The published crate includes its licence, library
unit tests and a tested example. Its repository integration tests use the shared
cross-language conformance pack. Kotlin is also available as self-contained
source under `kotlin/core/src/main/kotlin`.

## Verify a release

Releases publish through the Anvil reusable GitHub Actions workflow using npm
trusted publishing. Independent builds must produce the same npm tarball before
publication. CI separately rebuilds the packaged WASM with the pinned compiler
and requires matching bytes. The release workflow runs the required tests and
checks the actual packed consumer interface.

After upload, a separate check waits up to 20 minutes for public registry
availability, compares the downloaded tarball with the GitHub release asset,
and tests a fresh install, including TypeScript/WASM agreement and npm signatures
and provenance. A failed availability check requires investigation; it is not a
reason to republish the same version. npm's
[publish-time scanning](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/)
can delay installation after a successful upload.

```sh
npm view @forgesworn/qr version dist.integrity dist.attestations
```

Match the version to the [GitHub release](https://github.com/forgesworn/qr/releases),
review its notes and use your lockfile to retain the selected package integrity.
The versioned package includes its MIT licence, declarations and specification.

## Rust release workflow

The separate `release-rust.yml` workflow publishes an existing GitHub release
tag after testing the repository and extracted crate. Initial publication uses
a temporary `CARGO_REGISTRY_TOKEN` environment secret, removed afterwards.
The trusted publisher is registered for `forgesworn/qr`, workflow
`release-rust.yml`, environment `crates-publish`. The workflow supports
`verify_only=true` to exchange a short-lived publishing token without uploading
a crate. This checks registry authentication without releasing another version.

## JSR and Maven Central release workflows

The published coordinates are `@forgesworn/qr` on JSR and
`io.github.forgesworn:qr` on Maven Central. Both workflows take an existing stable
GitHub release tag and default to a dry run. They use the current packaging
configuration and require unchanged library sources from the selected tag.
Their GitHub environments permit deployment only from `main`.

`release-jsr.yml` stages the TypeScript sources and verified WASM bytes, requires
strict JSR declaration generation and tests a Deno consumer. A loopback registry
fixture captures the actual publishing archive and requires unchanged WASM bytes
before the real upload. Publication uses
GitHub OIDC with provenance. Afterwards it checks native JSR imports and the
registry-generated npm compatibility archive, including its types and WASM.
The npmjs package remains the recommended npm installation route.
`jsr-release.json` binds a JSR packaging version to the library source version.
JSR 0.3.1 packages the 0.3.0 library. JSR 0.3.0 was yanked because Deno rewrote a
WASM import during publication. The staged binary now uses the opaque `.bin`
extension; only its staged URL changes, and its bytes must retain the release
hash. The repository and npm WASM filenames remain unchanged.

`release-maven.yml` tests and stages the JVM 17 library, sources, generated API
documentation and Maven metadata. Its only runtime dependency is the Kotlin
standard library. The `maven-central` environment holds `CENTRAL_USERNAME`,
`CENTRAL_PASSWORD`, `MAVEN_GPG_PRIVATE_KEY` and `MAVEN_GPG_PASSPHRASE`.
The Central credentials are the generated user-token pair, not login credentials.
The public signing key is [kotlin/signing-key.asc](../kotlin/signing-key.asc),
fingerprint `E6762E1C42D06BD8F591A50E5FF0091A43ABEF66`, also available from
[keyserver.ubuntu.com](https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xE6762E1C42D06BD8F591A50E5FF0091A43ABEF66).
Rotate the key before its expiry on 15 November 2028.

The Maven workflow verifies every signature, uploads one signed bundle, waits
for Central validation, then requests publication once. It retains the deployment
identity even on failure. After Central reports publication, it compares public
artefact bytes and runs an independent consumer against Maven Central.

Never rerun an uncertain publication blindly. Inspect the retained receipt,
workflow logs and registry state first. A successful upload is separate from
public availability; a delayed public readback does not justify reuploading.
Maven readback can be rerun with `scripts/verify-maven-publication.py` using the
retained `kotlin/build/central-publication/receipt.json`. JSR readback uses
`scripts/verify-jsr-publication.mjs --stage <verified-stage>`, or dispatch
`release-jsr.yml` with `verify_only=true` to check the existing package without
uploading it again.

JSR 0.3.1 passed native Deno and registry-generated npm compatibility consumers;
Maven 0.3.0 passed its public Gradle consumer and signed artefact byte comparison.
The Rust trusted-publishing authentication check also passed without uploading
another crate version. An account, reserved name or GitHub source release alone
does not establish registry availability.

## Search and AI discovery

The site serves complete static HTML, canonical page URLs, a sitemap, source
links, software metadata, `llms.txt` and `llms-full.txt`. The full text is generated
from the same reviewed documents, and CI checks it for drift. These provide
accessible information about the actual API, use cases, evidence and limits.

They do not guarantee crawling, indexing or recommendations. Google states that
its AI search features use the ordinary search eligibility requirements and do
not require special AI files; see its
[official guidance](https://developers.google.com/search/docs/appearance/ai-features).
The machine-readable files are a convenience for documentation consumers, not
an instruction for an assistant to recommend this library regardless of fit.
