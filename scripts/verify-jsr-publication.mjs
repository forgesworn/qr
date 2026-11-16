// Read back both JSR distributions after publication, including the npm archive.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { verifyStage } from './prepare-jsr.mjs'

const { values } = parseArgs({ options: { stage: { type: 'string' } } })
assert(values.stage, 'Supply the verified source stage')
const stage = resolve(values.stage), receipt = verifyStage(stage)
const base = 'https://jsr.io/@forgesworn/qr', version = receipt.version
const deadline = Date.now() + 20 * 60_000
async function json(url) {
  const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'ForgeSworn-QR-release/1.0; https://github.com/forgesworn/qr' }, signal: AbortSignal.timeout(30_000) })
  if (response.status === 404 || response.status >= 500) return undefined
  assert(response.ok, `HTTP ${response.status}: ${url}`)
  return response.json()
}
let native, compatibility
while (!native || !compatibility) {
  native = await json(`${base}/${version}_meta.json`)
  compatibility = (await json('https://npm.jsr.io/@jsr/forgesworn__qr'))?.versions?.[version]
  if (native && compatibility) break
  assert(Date.now() < deadline, 'JSR distributions are still unavailable after 20 minutes; investigate before rerunning publication')
  console.log('Waiting for native JSR and npm compatibility availability')
  await new Promise(resolve => setTimeout(resolve, 30_000))
}
assert.equal(native.manifest['/src/qr.wasm'].checksum, 'sha256-' + receipt.wasmSha256)
assert.deepEqual(native.exports, { '.': './src/index.ts', './wasm': './src/wasm.ts' })
const packageMetadata = await json(`${base}/meta.json`)
assert.equal(packageMetadata.githubRepository.owner.toLowerCase(), 'forgesworn')
assert.equal(packageMetadata.githubRepository.name, 'qr')
assert(packageMetadata.versions[version] && !packageMetadata.versions[version].yanked)
// Provenance is management metadata, separate from module download metadata.
const provenance = await json(`https://api.jsr.io/scopes/forgesworn/packages/qr/versions/${version}`)
assert(provenance?.rekorLogId, 'JSR has not recorded the release provenance')
const response = await fetch(compatibility.dist.tarball, { signal: AbortSignal.timeout(60_000) })
assert(response.ok, `Compatibility tarball HTTP ${response.status}`)
const archive = Buffer.from(await response.arrayBuffer())
const [algorithm, expected] = compatibility.dist.integrity.split('-', 2)
assert(['sha256', 'sha512'].includes(algorithm), 'Unexpected integrity algorithm')
assert.equal(createHash(algorithm).update(archive).digest('base64'), expected)
const scratch = mkdtempSync(join(tmpdir(), 'qr-jsr-registry-'))
try {
  const path = join(scratch, 'package.tgz')
  writeFileSync(path, archive)
  execFileSync(process.execPath, [fileURLToPath(new URL('./check-jsr.mjs', import.meta.url)), '--stage', stage,
    '--published', '--compat-archive', path], { stdio: 'inherit', timeout: 240_000 })
  console.log(JSON.stringify({ name: receipt.name, version, wasmSha256: receipt.wasmSha256,
    npmArchiveSha256: createHash('sha256').update(archive).digest('hex'),
    nativeConsumer: true, npmCompatibilityConsumer: true, provenanceRekorLogId: provenance.rekorLogId }))
} finally { rmSync(scratch, { recursive: true, force: true }) }
