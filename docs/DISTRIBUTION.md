# Distribution

The JavaScript/TypeScript and optional WebAssembly backends share the npm
package `@forgesworn/qr`. They use the same version. The native Rust crate is `forgesworn-qr`. Kotlin currently comes from this
repository; do not invent Maven or JSR coordinates.

| Channel | What it provides |
|---|---|
| [npm](https://www.npmjs.com/package/@forgesworn/qr) | Versioned ESM, declarations, optional WASM and documentation |
| [GitHub releases](https://github.com/forgesworn/qr/releases) | Release notes, source snapshots and npm integrity/provenance information |
| [Documentation](https://forgesworn.github.io/qr/) | Guide, API, comparison, specification and machine-readable text |
| [jsDelivr](https://www.jsdelivr.com/package/npm/@forgesworn/qr) | CDN distribution of the npm package |
| [UNPKG](https://unpkg.com/@forgesworn/qr/) | CDN distribution of the npm package |
| Kotlin | Source under `kotlin/core/src/main/kotlin`, JVM 17, Kotlin standard library required |
| [crates.io](https://crates.io/crates/forgesworn-qr) | Native Rust source crate, no runtime dependencies, Rust 1.96+ |
| [docs.rs](https://docs.rs/forgesworn-qr) | Rust API documentation and tested usage examples |

CDNs are third-party delivery services. Pin an exact version for production and
prefer self-hosting assets where you need control over availability and privacy.
The library itself never fetches an asset automatically.

## Install and pin

```sh
npm install --save-exact @forgesworn/qr@0.3.0
# Equivalent: pnpm add --save-exact @forgesworn/qr@0.3.0
# Equivalent: yarn add --exact @forgesworn/qr@0.3.0
```

Use `import` with Node 22.13+ or an ES2022-capable browser/bundler. The ordinary
entry point has no WebAssembly initialisation requirement. Import the optional
backend from `@forgesworn/qr/wasm` and supply the bundled module bytes explicitly.

## Native Rust

```sh
cargo add forgesworn-qr@0.3.0
```

See the [Rust guide](../rust/README.md) for API contracts, pixel layout and
character-set differences. The published crate includes its licence, library
unit tests and a tested example. Its repository integration tests use the shared
cross-language conformance pack. Kotlin remains available as self-contained
source under `kotlin/core/src/main/kotlin`.

## Verify a release

Releases publish through the Anvil reusable GitHub Actions workflow using npm
trusted publishing. Independent builds must produce the same npm tarball before
publication. CI separately rebuilds the packaged WASM with the pinned compiler
and requires matching bytes. The release workflow runs the required tests and
checks the actual packed consumer interface.

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
Subsequent publication uses crates.io trusted publishing once the crate owner
registers `forgesworn/qr`, workflow `release-rust.yml`, environment
`crates-publish` in the crate settings. That registry-side registration is
separate from committing the workflow.

## Other registries

Maven Central and JSR require separate publisher accounts and package setup. A GitHub source release does not establish a release
on those registries. Registry publication will be documented here only after
the package can be installed and verified there.

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
