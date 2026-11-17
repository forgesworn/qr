import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { verifyBuildIdentity } from './verify-build-identity.mjs'

if (process.argv.length !== 7) throw Error('Usage: node own-fixtures.mjs ROOT BUILD FIXTURE RIVALS NEW_RESULT')
const [root, build, fixture, rivals, out] = process.argv.slice(2).map(p => resolve(p))
const ts = createRequire(root + '/package.json')('typescript')
const external = createRequire(rivals + '/package.json')
assert.equal(external('qrcode/package.json').version, '1.5.4')
const sha = x => createHash('sha256').update(x).digest('hex')
const load = p => import(pathToFileURL(build + '/' + p).href)
const source = readFileSync(fixture, 'utf8'), identity = verifyBuildIdentity(root, build)
assert.equal(identity.revision, '8360eb3b648ebc1d9439684a9f643cc1fb162713')
for (const [variant, files] of Object.entries(identity.generated)) for (const [name, hash] of Object.entries(files))
  assert.equal(sha(readFileSync(build + '/' + variant + '/' + name.replace(/\.ts$/, '.js'))), hash)
for (const [name, replacement] of [['own', './base/encode.js'], ['oracle', './alternate-grid-oracle-encode.js']]) {
  assert.equal(source.split('../src/encode.js').length, 2)
  const transpiled = ts.transpileModule(source.replace('../src/encode.js', replacement), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  })
  assert.equal(transpiled.diagnostics?.length ?? 0, 0, 'Fixture transpile diagnostics')
  const js = transpiled.outputText
  writeFileSync(build + '/alternate-grid-' + name + '-fixture.js', js, { flag: 'wx' })
}
writeFileSync(build + '/alternate-grid-oracle-encode.js', `import {createRequire} from 'node:module';
const qr=createRequire(${JSON.stringify(rivals + '/package.json')})('qrcode');
export function encode(text,{version,ecc}){const q=qr.create(text,{version,errorCorrectionLevel:ecc});return {size:q.modules.size,modules:q.modules.data}}
`, { flag: 'wx' })
const own = await load('alternate-grid-own-fixture.js'), oracle = await load('alternate-grid-oracle-fixture.js')
const base = await load('base/decode.js'), candidate = await load('public/decode.js')
const manifestPath = root + '/benchmarks/2026-11-16-m4/deferred-mesh-reading/new128-manifest.json'
const manifest = JSON.parse(readFileSync(manifestPath)), rows = []
const work = () => ({ steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 })
for (const index of [90]) {
  const frozen = manifest.cases.find(c => c.id === 'mesh-retain-unseen-' + index)
  const independent = oracle.alternateGridPicture(), f = own.alternateGridPicture()
  // Exact oracle pixels validate the copied renderer, not own-encoder equality.
  assert.equal(sha(independent.image.data), frozen.pixelSha256)
  assert.equal(sha(independent.text), frozen.textSha256)
  assert.equal(f.text, independent.text)
  const pixels = sha(f.image.data), beforeWork = work(), afterWork = work()
  const before = base.decodeCounted(f.image, {}, beforeWork)
  assert.equal(sha(f.image.data), pixels)
  const after = candidate.decodeCounted(f.image, {}, afterWork)
  assert.equal(sha(f.image.data), pixels)
  for (const result of [before, after]) if (result) {
    assert.equal(result.text, f.text)
    assert.deepEqual(result.bytes, new TextEncoder().encode(f.text))
    for (const key of ['version', 'ecc', 'mirrored', 'inverted']) assert.equal(result[key], f[key])
  }
  assert.equal(before, undefined, 'Regression fixture must fail on released baseline')
  assert.ok(after, 'Regression fixture must recover on candidate')
  assert.deepEqual(afterWork, beforeWork, 'Recovery must reuse existing work')
  assert(afterWork.maps <= 720 && afterWork.second <= 8 && afterWork.probed <= 11_500_000)
  rows.push({ index, oraclePixelSha256: frozen.pixelSha256, ownPixelSha256: pixels,
    identicalPixels: pixels === frozen.pixelSha256, before: !!before, after: !!after, beforeWork, afterWork })
}
writeFileSync(out, JSON.stringify({ passed: true, identity, fixtureSha256: sha(readFileSync(fixture)),
  runnerSha256: sha(readFileSync(new URL(import.meta.url))), manifestSha256: sha(readFileSync(manifestPath)),
  compiler: ts.version, qrcode: '1.5.4', rows }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(rows))
