const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const {execFileSync} = require('node:child_process')
if (process.argv.length !== 5) throw Error('Usage: node build-production.cjs ROOT CANDIDATE_SOURCE NEW_BUILD')
const [root, source, out] = process.argv.slice(2).map(p => path.resolve(p))
const ts = require(path.join(root, 'node_modules/typescript'))
const sha = x => crypto.createHash('sha256').update(x).digest('hex')
const revision = 'f129243285ce6d2c57819e1aa91b70807bb74741'
const expectedPrototype = '79f605719b2e62a4d3f664a24a417cdb50d1e1f4b8160d4ac6ab9c65f97d6e36'
const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding:'utf8'})
const assert = require('node:assert/strict')
const productionHead = git('rev-parse', 'HEAD').trim()
assert.equal(sha(fs.readFileSync(path.join(__dirname, 'prototype.py'))), expectedPrototype)
const prototype = JSON.parse(fs.readFileSync(source + '/identity.json'))
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected-sources.json')))
assert.equal(prototype.revision, revision)
assert.equal(prototype.prototypeSha256, expectedPrototype)
assert.deepEqual(prototype.sourceFiles, expected)
assert.equal(prototype.expectedSourcesSha256, sha(fs.readFileSync(path.join(__dirname, 'expected-sources.json'))))
for (const [name, hash] of Object.entries(expected)) {
  assert.equal(sha(git('show', revision + ':src/' + name)), hash, 'Uncommitted baseline source: ' + name)
}
for (const [name, hash] of Object.entries(prototype.copiedFiles)) {
  assert.equal(sha(fs.readFileSync(source + '/' + name)), hash, 'Prototype source drift: ' + name)
  assert.equal(sha(fs.readFileSync(root + '/src/' + name)), hash, 'Production source differs from qualified prototype: ' + name)
}
assert.deepEqual(Object.keys(prototype.copiedFiles).sort(), Object.keys(expected).sort())
assert.deepEqual(fs.readdirSync(source).filter(n => n.endsWith('.ts')).sort(), Object.keys(expected).filter(n => n.endsWith('.ts')).sort())
const configBytes = fs.readFileSync(root + '/tsconfig.json')
const packageBytes = fs.readFileSync(root + '/package.json')
assert.equal(sha(configBytes), sha(git('show', revision + ':tsconfig.json')))
const formatHost = {getCurrentDirectory: () => root, getCanonicalFileName: p => p, getNewLine: () => '\n'}
function diagnostics(items, context) {
  if (items.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(items, formatHost))
    throw Error(context + ': ' + items.length + ' TypeScript diagnostic(s)')
  }
}
const readConfig = ts.readConfigFile(root + '/tsconfig.json', ts.sys.readFile)
diagnostics(readConfig.error ? [readConfig.error] : [], 'Read tsconfig')
const parsed = ts.parseJsonConfigFileContent(readConfig.config, ts.sys, root)
diagnostics(parsed.errors, 'Parse tsconfig')
assert.equal(JSON.parse(packageBytes).type, 'module')
fs.mkdirSync(out)
fs.writeFileSync(out + '/package.json', packageBytes)
const names = Object.keys(expected).filter(n => n.endsWith('.ts')).sort()
const sources = {}, generated = {}, checkedOptions = {}
for (const variant of ['base', 'public']) {
  const checkDir = out + '/check-' + variant
  fs.mkdirSync(checkDir)
  fs.mkdirSync(out + '/' + variant)
  sources[variant] = {}; generated[variant] = {}
  for (const name of names) {
    const contents = variant === 'base' ? git('show', revision + ':src/' + name) : fs.readFileSync(root + '/src/' + name, 'utf8')
    sources[variant][name] = sha(contents)
    fs.writeFileSync(checkDir + '/' + name, contents)
  }
  // Preserve the repository compiler options. Only relocate filesystem paths;
  // the first program explicitly typechecks the copied files without emission.
  const options = {...parsed.options, rootDir:checkDir, outDir:out + '/' + variant, noEmit:true}
  const roots = names.map(name => checkDir + '/' + name)
  const checked = ts.createProgram(roots, options)
  diagnostics(ts.getPreEmitDiagnostics(checked), 'Typecheck ' + variant)
  checkedOptions[variant] = {...options, rootDir:'check-' + variant, outDir:variant}
  const emitted = ts.createProgram(roots, {...options, noEmit:false})
  const result = emitted.emit()
  diagnostics(result.diagnostics, 'Emit ' + variant)
  if (result.emitSkipped) throw Error('Skipped ' + variant + ' emission')
  for (const name of names)
    generated[variant][name] = sha(fs.readFileSync(out + '/' + variant + '/' + name.replace(/\.ts$/, '.js')))
}
const receipt = JSON.parse(fs.readFileSync(root + '/benchmarks/2026-11-17-m4/alternate-grid-recovery/production-qualified.json'))
assert.deepEqual(sources.base, receipt.identity.sources.public, 'Baseline source binding')
assert.deepEqual(generated.base, receipt.identity.generated.public, 'Baseline emitted JavaScript differs from release')
const pngSource = fs.readFileSync(root + '/test/png.ts', 'utf8')
assert.equal(sha(pngSource), sha(git('show', revision + ':test/png.ts')))
const png = ts.transpileModule(pngSource, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},reportDiagnostics:true})
diagnostics(png.diagnostics || [], 'PNG helper transpilation')
fs.writeFileSync(out + '/png.js', png.outputText)
const identity = {revision, productionHead, compiler:ts.version, sources, generated, prototype,
  builderSha256:sha(fs.readFileSync(__filename)),
  typecheck:{passed:true,diagnostics:0,tsconfigSha256:sha(configBytes),packageJsonSha256:sha(packageBytes),options:checkedOptions},
  helpers:{pngJsSha256:sha(png.outputText)}}
fs.writeFileSync(out + '/identity.json', JSON.stringify(identity, null, 2) + '\n')
console.log('Typechecked and emitted pinned baseline and copied candidate: ' + names.length + ' modules each')
