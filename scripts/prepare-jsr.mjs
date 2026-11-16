// Produce a source-only JSR package without changing the npm or decoder sources.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export const packageName = '@forgesworn/qr'
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const json = file => JSON.parse(readFileSync(file, 'utf8'))
const serialise = value => JSON.stringify(value, null, 2) + '\n'
const stableVersion = version => typeof version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)

function filesUnder(directory, prefix = '') {
  const result = []
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name), relative = prefix + name
    const info = lstatSync(path)
    assert(!info.isSymbolicLink(), `Symlinks are not supported: ${path}`)
    if (info.isDirectory()) result.push(...filesUnder(path, relative + '/'))
    else { assert(info.isFile(), `Not a regular file: ${path}`); result.push(relative) }
  }
  return result
}

export function verifyStage(directory) {
  const receipt = json(join(directory, '.stage-manifest.json'))
  assert.equal(receipt.name, packageName)
  assert(stableVersion(receipt.version), 'Staged version must be a stable major.minor.patch version')
  assert(stableVersion(receipt.sourceVersion), 'Staged source version must identify the stable library release')
  const actual = filesUnder(directory).filter(name => name !== '.stage-manifest.json').sort()
  assert.deepEqual(actual, Object.keys(receipt.files).sort(), 'Staged file inventory changed')
  for (const name of actual) assert.equal(sha256(readFileSync(join(directory, name))), receipt.files[name], `Staged file changed: ${name}`)
  const config = json(join(directory, 'jsr.json'))
  const pkg = json(join(directory, 'package.json'))
  for (const metadata of [config, pkg]) {
    assert.equal(metadata.name, packageName); assert.equal(metadata.version, receipt.version)
    assert.equal(Object.keys(metadata.dependencies ?? {}).length, 0)
  }
  assert.deepEqual(config.exports, { '.': './src/index.ts', './wasm': './src/wasm.ts' })
  assert.equal(pkg.type, 'module')
  const manifest = json(join(directory, 'src/wasm-manifest.json'))
  const wasm = readFileSync(join(directory, 'src/qr.bin'))
  assert.equal(manifest.abi, 2)
  assert.equal(wasm.length, manifest.bytes)
  assert.equal(sha256(wasm), manifest.sha256)
  assert.equal(manifest.sha256, receipt.wasmSha256)
  assert.equal(manifest.sourceSha256, receipt.wasmSourceSha256)
  return receipt
}

export async function prepare(root, destination) {
  const pkg = json(join(root, 'package.json'))
  assert.equal(pkg.name, packageName)
  assert(stableVersion(pkg.version), 'Source package must have a stable major.minor.patch version')
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0, 'Runtime dependencies need explicit review')
  const release = json(join(root, 'jsr-release.json'))
  assert(stableVersion(release.version), 'JSR version must be stable')
  assert.equal(release.sourceVersion, pkg.version, 'JSR packaging must name the current library version')
  const manifest = json(join(root, 'wasm/manifest.json'))
  const wasm = readFileSync(join(root, 'wasm/qr.wasm'))
  // Import the helper from the supplied checkout: its module-relative root binds
  // sourceHash() to that checkout, rather than to this script's own location.
  const { sourceHash } = await import(pathToFileURL(join(root, 'scripts/wasm-source.mjs')).href)
  assert.equal(manifest.abi, 2)
  assert.equal(manifest.sourceSha256, sourceHash(), 'Bundled WASM source identity is stale')
  assert.equal(manifest.sha256, sha256(wasm), 'Bundled WASM hash mismatch')
  assert.equal(manifest.bytes, wasm.length, 'Bundled WASM size mismatch')
  if (existsSync(destination)) {
    assert(lstatSync(destination).isDirectory() && !lstatSync(destination).isSymbolicLink(), 'Destination must be a real directory')
    assert.equal(readdirSync(destination).length, 0, 'Refusing to overwrite a nonempty destination')
  } else mkdirSync(destination, { recursive: true })

  const sourceFiles = filesUnder(join(root, 'src'))
  assert(sourceFiles.every(name => name.endsWith('.ts')), 'Unexpected non-TypeScript source file')
  const copied = [...sourceFiles.map(name => 'src/' + name), 'README.md', 'LICENSE',
    'THIRD_PARTY_NOTICES.md', 'SPEC.md', 'PERFORMANCE.md', 'SECURITY.md', 'CHANGELOG.md',
    'llms.txt', 'llms-full.txt', ...filesUnder(join(root, 'licenses')).map(name => 'licenses/' + name),
    ...filesUnder(join(root, 'docs')).filter(name => name.endsWith('.md')).map(name => 'docs/' + name)].sort()
  for (const name of copied) {
    const source = join(root, name)
    assert(lstatSync(source).isFile() && !lstatSync(source).isSymbolicLink(), `Not a regular source file: ${name}`)
    mkdirSync(dirname(join(destination, name)), { recursive: true })
    copyFileSync(source, join(destination, name))
  }
  // Deno rewrites import names inside .wasm files during publication. Keep this
  // caller-instantiated binary opaque and change only the staged asset URL.
  copyFileSync(join(root, 'wasm/qr.wasm'), join(destination, 'src/qr.bin'))
  const adapter = join(destination, 'src/wasm.ts')
  const adapterSource = readFileSync(adapter, 'utf8')
  assert.equal(adapterSource.split("new URL('./qr.wasm', import.meta.url)").length, 2)
  writeFileSync(adapter, adapterSource.replace("new URL('./qr.wasm', import.meta.url)", "new URL('./qr.bin', import.meta.url)"))
  copyFileSync(join(root, 'wasm/manifest.json'), join(destination, 'src/wasm-manifest.json'))
  // Keep ESM metadata; publish with --sloppy-imports to resolve NodeNext .js
  // specifiers to .ts. No build hooks or development dependencies are copied.
  writeFileSync(join(destination, 'package.json'), serialise({ name: pkg.name, version: release.version, type: 'module', license: pkg.license }))
  writeFileSync(join(destination, 'jsr.json'), serialise({ name: pkg.name, version: release.version, license: pkg.license,
    exports: { '.': './src/index.ts', './wasm': './src/wasm.ts' },
    publish: { include: [...copied, 'src/qr.bin', 'src/wasm-manifest.json', 'package.json', 'jsr.json'].sort() },
  }))
  const receipt = { name: pkg.name, version: release.version, sourceVersion: release.sourceVersion, wasmSha256: manifest.sha256,
    wasmSourceSha256: manifest.sourceSha256, files: Object.fromEntries(filesUnder(destination).map(name => [name, sha256(readFileSync(join(destination, name)))])) }
  writeFileSync(join(destination, '.stage-manifest.json'), serialise(receipt))
  verifyStage(destination)
  return receipt
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { root: { type: 'string' }, out: { type: 'string' } } })
  const root = resolve(values.root ?? fileURLToPath(new URL('../', import.meta.url)))
  const destination = values.out ? resolve(values.out) : mkdtempSync(join(tmpdir(), 'qr-jsr-'))
  try {
    const receipt = await prepare(root, destination)
    console.log(JSON.stringify({ stage: destination, name: receipt.name, version: receipt.version, wasmSha256: receipt.wasmSha256,
      manifestSha256: sha256(readFileSync(join(destination, '.stage-manifest.json'))) }, null, 2))
  } catch (error) {
    if (!values.out) rmSync(destination, { recursive: true, force: true })
    throw error
  }
}
