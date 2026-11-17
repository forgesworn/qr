import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {resolve,join} from 'node:path'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const revision = 'f129243285ce6d2c57819e1aa91b70807bb74741'
const privateFile = name => new URL(name, import.meta.url)

// Verify the frozen source and every compiled module before loading any decoder.
export function verifyBuildIdentity(rootPath, buildPath) {
  const root = resolve(rootPath), build = resolve(buildPath)
  assert.equal(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), revision)
  const identity = JSON.parse(readFileSync(join(build, 'identity.json')))
  const expectedBytes = readFileSync(privateFile('./expected-sources.json'))
  const expected = JSON.parse(expectedBytes)
  assert.equal(identity.revision, revision)
  assert.equal(identity.prototype.revision, revision)
  const prototypeHash = '79f605719b2e62a4d3f664a24a417cdb50d1e1f4b8160d4ac6ab9c65f97d6e36'
  assert.equal(sha(readFileSync(privateFile('./prototype.py'))), prototypeHash)
  assert.equal(identity.prototype.prototypeSha256, prototypeHash)
  assert.equal(identity.prototype.expectedSourcesSha256, sha(expectedBytes))
  assert.deepEqual(identity.prototype.sourceFiles, expected)
  const release = JSON.parse(readFileSync(join(root, 'benchmarks/2026-11-17-m4/alternate-grid-recovery/production-qualified.json')))
  assert.deepEqual(identity.sources.base, release.identity.sources.public)
  assert.deepEqual(identity.generated.base, release.identity.generated.public)
  assert.deepEqual(identity.sources.base, expected)
  assert.deepEqual(identity.sources.public, identity.prototype.copiedFiles)
  const sourceNames = readdirSync(join(root, 'src')).filter(name => name.endsWith('.ts')).sort()
  assert.deepEqual(Object.keys(expected).sort(), sourceNames)
  for (const name of sourceNames) {
    const content = readFileSync(join(root, 'src', name))
    assert.equal(sha(content), expected[name], `Baseline source ${name}`)
    assert.equal(sha(execFileSync('git', ['-C', root, 'show', `${revision}:src/${name}`])), expected[name])
  }
  assert.equal(identity.compiler, createRequire(join(root, 'package.json'))('typescript/package.json').version)
  assert.equal(identity.builderSha256, sha(readFileSync(privateFile('./build-candidate.cjs'))))
  assert.equal(identity.typecheck.passed, true)
  assert.equal(identity.typecheck.diagnostics, 0)
  assert.equal(identity.typecheck.tsconfigSha256, sha(readFileSync(join(root, 'tsconfig.json'))))
  assert.equal(identity.typecheck.packageJsonSha256, sha(readFileSync(join(root, 'package.json'))))
  assert.equal(sha(readFileSync(join(build, 'package.json'))), identity.typecheck.packageJsonSha256)
  assert(identity.typecheck.options && typeof identity.typecheck.options === 'object')
  for (const variant of ['base', 'public']) {
    assert.deepEqual(Object.keys(identity.sources[variant]).sort(), sourceNames)
    assert.deepEqual(Object.keys(identity.generated[variant]).sort(), sourceNames)
    const generated = readdirSync(join(build, variant)).filter(name => name.endsWith('.js')).sort()
    assert.deepEqual(generated, sourceNames.map(name => name.replace(/\.ts$/, '.js')).sort())
    for (const name of sourceNames) {
      assert.equal(sha(readFileSync(join(build, 'check-' + variant, name))), identity.sources[variant][name], `${variant} source ${name}`)
      const js = name.replace(/\.ts$/, '.js')
      assert.equal(sha(readFileSync(join(build, variant, js))), identity.generated[variant][name], `${variant} ${js}`)
    }
  }
  assert.equal(sha(readFileSync(join(build, 'png.js'))), identity.helpers.pngJsSha256)
  return identity
}
