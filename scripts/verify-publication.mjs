// A successful upload can precede public availability while npm scans a release.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const tag = process.argv[2]
assert(/^v\d+\.\d+\.\d+$/.test(tag ?? ''), 'Supply a stable release tag, such as v0.3.0')
const version = tag.slice(1), name = '@forgesworn/qr'
const registry = 'https://registry.npmjs.org/' + encodeURIComponent(name)
const deadline = Date.now() + 20 * 60_000
let metadata
while (!metadata) {
  try {
    const response = await fetch(registry, {
      headers: { accept: 'application/vnd.npm.install-v1+json', 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok && response.status !== 404 && response.status < 500) throw Error(`Registry HTTP ${response.status}`)
    if (response.ok) metadata = (await response.json()).versions?.[version]
  } catch (error) {
    if (error.message?.startsWith('Registry HTTP')) throw error
    console.error(`Registry availability check: ${error.message}`)
  }
  if (metadata) break
  if (Date.now() >= deadline) throw Error(`${name}@${version} is still unavailable after 20 minutes`)
  console.error(`Waiting for ${name}@${version} to become publicly installable`)
  await new Promise(resolve => setTimeout(resolve, 30_000))
}

const scratch = mkdtempSync(join(tmpdir(), 'qr-publication-'))
try {
  assert.equal(metadata.dist.attestations?.provenance?.predicateType, 'https://slsa.dev/provenance/v1', 'Registry has no npm provenance attestation')
  const asset = `forgesworn-qr-${version}.tgz`
  const releaseResponse = await fetch(`https://github.com/forgesworn/qr/releases/download/${tag}/${asset}`, { signal: AbortSignal.timeout(60_000) })
  assert(releaseResponse.ok, `Release asset HTTP ${releaseResponse.status}`)
  const canonical = Buffer.from(await releaseResponse.arrayBuffer())
  assert.equal(metadata.dist.integrity, 'sha512-' + createHash('sha512').update(canonical).digest('base64'), 'Registry integrity differs from the reproducible release asset')
  const response = await fetch(metadata.dist.tarball, { signal: AbortSignal.timeout(60_000) })
  assert(response.ok, `Registry tarball HTTP ${response.status}`)
  const distributed = Buffer.from(await response.arrayBuffer())
  assert(distributed.equals(canonical), 'Registry tarball differs from the GitHub release asset')
  writeFileSync(join(scratch, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  execFileSync('npm', ['install', '--registry=https://registry.npmjs.org', '--ignore-scripts', '--prefer-online', '--no-audit', '--no-fund', '--save-exact', `${name}@${version}`], { cwd: scratch, stdio: 'inherit', timeout: 120_000 })
  const packageRoot = join(scratch, 'node_modules/@forgesworn/qr')
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json')))
  assert.equal(pkg.version, version)
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0)
  const ts = await import(pathToFileURL(join(packageRoot, 'dist/index.js')))
  const adapter = await import(pathToFileURL(join(packageRoot, 'dist/wasm.js')))
  const bytes = readFileSync(new URL(adapter.wasmUrl))
  const wasm = await adapter.loadWasm(bytes)
  try {
    for (const input of ['https://example.com/release', 'QR release ✓', new Uint8Array([0, 127, 255])]) {
      const code = ts.encode(input)
      assert.deepEqual(wasm.encode(input), code)
      const decoded = wasm.decodeModules(code.modules, code.size)
      assert(decoded, 'Published package could not decode its encoded payload')
      assert.deepEqual(decoded.bytes, typeof input === 'string' ? new TextEncoder().encode(input) : input)
      if (typeof input === 'string') assert.equal(decoded.text, input)
      assert.deepEqual(decoded, ts.decodeModules(code.modules, code.size))
    }
    const session = wasm.createDecoder()
    session.reset(); ts.createDecoder().reset(); wasm.dispose()
    assert.throws(() => session.reset(), /disposed/)
  } finally { wasm.dispose() }
  execFileSync('npm', ['audit', 'signatures', '--registry=https://registry.npmjs.org'], { cwd: scratch, stdio: 'inherit', timeout: 120_000 })
  console.log(JSON.stringify({ name, version, tarballSha256: createHash('sha256').update(distributed).digest('hex'),
    wasmSha256: createHash('sha256').update(bytes).digest('hex'), matchingReleaseAsset: true,
    registryConsumer: true, signaturesAndProvenance: true }))
} finally { rmSync(scratch, { recursive: true, force: true }) }
