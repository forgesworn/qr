// Rebuild the distributed asset, or verify it byte-for-byte on an independent host.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compiler, root, sha256, sourceHash } from './wasm-source.mjs'

const mode = process.argv[2]
if (!['--write', '--check'].includes(mode)) throw new Error('Use --write to update the asset or --check to verify it')
const cwd = fileURLToPath(new URL('rust/', root))
const actual = execFileSync('rustc', ['--version'], { cwd, encoding: 'utf8' }).trim()
if (actual !== compiler) throw new Error(`Use ${compiler}; found ${actual}`)
// Keep the worktree's target directory. Remap paths and omit debug/name sections
// so the same compiler and sources produce the same bytes on different hosts.
execFileSync('cargo', ['build', '--locked', '--release', '--features', 'host-text', '--target', 'wasm32-unknown-unknown', '-j', '1'], {
  cwd, stdio: 'inherit', env: { ...process.env, RUSTFLAGS: `--remap-path-prefix=${fileURLToPath(root)}=. -C strip=symbols` },
})
const bytes = readFileSync(new URL('rust/target/wasm32-unknown-unknown/release/forgesworn_qr.wasm', root))
const manifest = { abi: 2, compiler, target: 'wasm32-unknown-unknown', sourceSha256: sourceHash(), sha256: sha256(bytes), bytes: bytes.length }
const asset = new URL('wasm/qr.wasm', root)
const metadata = new URL('wasm/manifest.json', root)
if (mode === '--write') {
  mkdirSync(new URL('wasm/', root), { recursive: true })
  writeFileSync(asset, bytes)
  writeFileSync(metadata, JSON.stringify(manifest, null, 2) + '\n')
} else {
  const expectedBytes = readFileSync(asset)
  const expectedManifest = JSON.parse(readFileSync(metadata, 'utf8'))
  const assetMatches = bytes.equals(expectedBytes)
  const provenanceMatches = JSON.stringify(manifest) === JSON.stringify(expectedManifest)
  if (!assetMatches || !provenanceMatches) {
    let firstDifferingByte = 0
    while (firstDifferingByte < Math.min(bytes.length, expectedBytes.length) && bytes[firstDifferingByte] === expectedBytes[firstDifferingByte]) firstDifferingByte++
    const report = {
      assetMatches, provenanceMatches, expected: expectedManifest, actual: manifest,
      expectedAssetSha256: sha256(expectedBytes),
      compilerVerbose: execFileSync('rustc', ['-vV'], { cwd, encoding: 'utf8' }).trim(),
      checkoutRoot: fileURLToPath(root),
      firstDifferingByte: assetMatches ? null : firstDifferingByte,
      expectedBytesAtDifference: expectedBytes.subarray(firstDifferingByte, firstDifferingByte + 16).toString('hex'),
      actualBytesAtDifference: bytes.subarray(firstDifferingByte, firstDifferingByte + 16).toString('hex'),
    }
    const reportJson = JSON.stringify(report, null, 2) + '\n'
    writeFileSync(new URL('rust/target/wasm-check-report.json', root), reportJson)
    console.error(reportJson)
    throw new Error('The WASM asset or provenance differs; rebuild with npm run build:wasm')
  }
}
console.log(`WASM ${mode}: ${bytes.length} bytes; sha256 ${manifest.sha256}`)
