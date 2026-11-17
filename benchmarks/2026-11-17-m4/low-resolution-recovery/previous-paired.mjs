import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { cpus, loadavg, platform } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.argv.length, 8, 'usage: node previous-paired.mjs <root> <baseline-dist> <rivals> <ts|wasm> <baseline-wasm> <output>')
const [rootArg, baselineArg, rivals, mode, oldWasm, outputArg] = process.argv.slice(2)
const root = resolve(rootArg), baselinePath = resolve(baselineArg), output = resolve(outputArg)
assert((cpus()[0]?.model ?? '').includes('M4'))
assert(['ts', 'wasm'].includes(mode))
const hash = value => createHash('sha256').update(value).digest('hex')
const load = path => import(pathToFileURL(path))
const released = JSON.parse(readFileSync(`${root}/benchmarks/2026-11-17-m4/quadratic-mesh-recovery/qualification.json`, 'utf8'))
for (const [source, expected] of Object.entries(released.identity.generated)) assert.equal(hash(readFileSync(`${baselinePath}/${source.replace(/\.ts$/, '.js')}`)), expected)
const prior = await load(`${baselinePath}/index.js`), current = await load(`${root}/dist/index.js`)
const { timingFrames, summary } = await load(`${root}/scripts/comparison-fixtures.mjs`)
const base = `${root}/benchmarks/2026-11-17-m4/quadratic-mesh-recovery`
const qualified = JSON.parse(readFileSync(`${base}/qualification.json`, 'utf8'))
const { corpora } = await load(`${base}/corpora.mjs`)
const { framesFor: validation } = await load(`${base}/validation-frames.mjs`)
const wanted = new Map([['boundary-unseen-2', 'gain'], ['boundary-unseen-8', 'gain'], ['mesh-retain-unseen-9', 'gain'], ['starvation-holdout-4', 'gain'], ['selected-mesh-holdout-0', 'gain'], ['small-parabola-validation-10', 'gain'], ['small-parabola-validation-15', 'gain'], ['starvation-holdout-42', 'prior'], ['selected-mesh-holdout-39', 'prior'], ['starvation-holdout-16', 'gain'], ['alternate-grid-holdout-16', 'gain'], ['alternate-grid-holdout-18', 'gain'], ['header-rediscovery-holdout-16', 'gain'], ['header-rediscovery-holdout-18', 'gain']])
const audit = JSON.parse(readFileSync(`${base}/timing-audit.json`, 'utf8'))
assert(audit.passed)
for (const item of audit.cases) wanted.set(item.id, item.role)
const fixtures = timingFrames(prior.encode).map(frame => ({ ...frame, role: 'fixed' }))
const sourceHashes = {}
for (const [name, generator, manifest] of [...corpora, ['new256', null, null]]) {
  const file = generator ? `${root}/benchmarks/2026-11-17-m4/selected-mesh-recovery/${generator}` : `${base}/validation-frames.mjs`
  sourceHashes[name] = hash(readFileSync(file))
  const frames = generator ? (await load(file)).framesFor(rivals) : validation(rivals)
  const m = JSON.parse(readFileSync(manifest ? `${root}/${manifest}` : `${base}/validation-manifest.json`))
  assert.deepEqual(frames.map(f => f.meta), m.cases)
  const suite = qualified.suites.find(s => s.name === name)
  for (const f of frames) {
    const role = wanted.get(f.meta.id)
    if (!role) continue
    const row = suite.rows.find(r => r.id === f.meta.id)
    assert.equal(hash(f.image.data), row.pixelSha256)
    assert.equal(row.readers.candidate.status, role === 'terminal-miss' ? 'miss' : 'correct')
    if (role === 'terminal-miss' || role === 'retained-prior-success') {
      const item = audit.cases.find(c => c.id === f.meta.id)
      assert.equal(item.pixelSha256, row.pixelSha256)
    }
    fixtures.push({ ...f.image, name: f.meta.id, expected: f.text, role, meta: f.meta })
    wanted.delete(f.meta.id)
  }
}
assert.equal(wanted.size, 0)
let readers = { baseline: prior, candidate: current }
const binaries = {}
if (mode === 'wasm') {
  const { loadWasm } = await load(`${root}/dist/wasm.js`)
  const b = readFileSync(oldWasm), c = readFileSync(`${root}/dist/qr.wasm`)
  assert.equal(hash(b), '022993bfb6895152421aaf22673484c8d6fb60be3edae44d5eb85c927f28e326')
  assert.equal(hash(c), JSON.parse(readFileSync(`${root}/wasm/manifest.json`, 'utf8')).sha256)
  readers = { baseline: await loadWasm(b), candidate: await loadWasm(c) }
  binaries.baseline = { sha256: hash(b), bytes: b.length }
  binaries.candidate = { sha256: hash(c), bytes: c.length }
}
const identity = directory => Object.fromEntries(readdirSync(directory).filter(name => name.endsWith('.js')).sort().map(name => [name, hash(readFileSync(`${directory}/${name}`))]))
const result = { mode, binaries, baselineGenerated: identity(baselinePath), candidateGenerated: identity(`${root}/dist`), node: process.version, arch: process.arch, platform: platform(), cpu: cpus()[0]?.model, loadBefore: loadavg(), runnerSha256: hash(readFileSync(new URL(import.meta.url))), fixtureSourceSha256: hash(readFileSync(`${root}/scripts/comparison-fixtures.mjs`)), sourceHashes, warmupMinimumPairs: 10, warmupMinimumMs: 500, measuredPairs: 60, cases: [] }
if (mode === 'wasm') result.linearCapacityBytesBefore = Object.fromEntries(Object.entries(readers).map(([name, reader]) => [name, reader.memoryBytes]))
try {
  for (const frame of fixtures) {
    const before = hash(frame.data), references = {}, samples = { baseline: [], candidate: [] }
    for (const [name, reader] of Object.entries(readers)) {
      const value = reader.decode(frame)
      const expected = frame.role === 'terminal-miss' && name === 'baseline' ? undefined : frame.expected
      if (frame.role === 'terminal-miss' && name === 'candidate' && value === undefined) {
        references[name] = value
        assert.equal(hash(frame.data), before)
        continue
      }
      assert.equal(value?.text, expected, `${frame.name}/${name}`)
      if (value) assert.deepEqual(Array.from(value.bytes), Array.from(new TextEncoder().encode(expected)))
      references[name] = value
      assert.equal(hash(frame.data), before)
    }
    if (references.baseline) assert.deepEqual(references.candidate, references.baseline)
    const pair = (round, measured) => {
      for (const name of round % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline']) {
        const start = performance.now(), value = readers[name].decode(frame), elapsed = performance.now() - start
        assert.deepEqual(value, references[name])
        assert.equal(hash(frame.data), before)
        if (measured) samples[name].push(elapsed)
      }
    }
    let rounds = 0
    const started = performance.now()
    while (rounds < 10 || performance.now() - started < 500) pair(rounds++, false)
    for (let round = 0; round < 60; round++) pair(round, true)
    result.cases.push({ name: frame.name, role: frame.role, meta: frame.meta, pixelSha256: before, width: frame.width, height: frame.height, warmupPairs: rounds, candidateRead: references.candidate !== undefined, ...Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { ...summary(values), samplesMs: values }])) })
  }
  if (mode === 'wasm') result.linearCapacityBytesAfter = Object.fromEntries(Object.entries(readers).map(([name, reader]) => [name, reader.memoryBytes]))
  result.loadAfter = loadavg()
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
} finally {
  if (mode === 'wasm') for (const reader of Object.values(readers)) reader.dispose()
}
