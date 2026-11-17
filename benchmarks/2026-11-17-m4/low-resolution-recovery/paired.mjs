import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { cpus, loadavg, platform } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.argv.length, 8, 'usage: node paired.mjs <root> <baseline-dist> <rivals> <ts|wasm> <baseline-wasm> <output>')
const [rootArg, baselineArg, rivals, mode, oldWasm, outputArg] = process.argv.slice(2)
const root = resolve(rootArg), baselinePath = resolve(baselineArg), output = resolve(outputArg)
const model = cpus()[0]?.model ?? 'unknown'
assert(model.includes('M4'), 'Paired acceptance timings must run on the M4')
assert.equal(process.arch, 'arm64')
assert(['ts', 'wasm'].includes(mode))
const hash = value => createHash('sha256').update(value).digest('hex')
const load = path => import(pathToFileURL(path))
const released = JSON.parse(readFileSync(`${root}/benchmarks/2026-11-17-m4/quadratic-mesh-recovery/qualification.json`, 'utf8'))
for (const [source, expected] of Object.entries(released.identity.generated)) {
  assert.equal(hash(readFileSync(`${baselinePath}/${source.replace(/\.ts$/, '.js')}`)), expected, `baseline ${source}`)
}
const prior = await load(`${baselinePath}/index.js`), current = await load(`${root}/dist/index.js`)
const { timingFrames, summary } = await load(`${root}/scripts/comparison-fixtures.mjs`)
process.env.QR_RIVALS = rivals
const { makeCase } = await load(`${root}/benchmarks/2026-11-16-m4/overflow-recovery/fresh160/generate.mjs`)
const manifest = JSON.parse(readFileSync(`${root}/benchmarks/2026-11-16-m4/overflow-recovery/fresh160/manifest.json`, 'utf8'))
const receipt = JSON.parse(readFileSync(`${root}/benchmarks/2026-11-17-m4/low-resolution-recovery/local-regression.json`, 'utf8'))
const suite = receipt.suites.find(s => s.name === 'previously-qualified160')
const wanted = new Map()
for (const id of ['010', '020', '027', '029', '046', '051', '077', '092', '094']) wanted.set(`holdout-${id}`, 'gain')
wanted.set('holdout-000', 'terminal-miss')
wanted.set('holdout-015', 'terminal-miss')
wanted.set('holdout-005', 'prior')
wanted.set('holdout-050', 'prior')
const fixtures = timingFrames(prior.encode).map(frame => ({ ...frame, role: 'fixed' }))
for (let i = 0; i < 160; i++) {
  const c = makeCase(i)
  assert.deepEqual(c.meta, manifest.cases[i])
  const role = wanted.get(c.meta.id)
  if (!role) continue
  assert.equal(hash(c.image.data), c.meta.greySha256)
  const row = suite.rows.find(r => r.name === c.meta.id)
  assert.equal(row.readers.base.status, role === 'prior' ? 'correct' : 'miss')
  assert.equal(row.readers.candidate.status, role === 'terminal-miss' ? 'miss' : 'correct')
  fixtures.push({ ...c.image, name: c.meta.id, expected: role === 'terminal-miss' ? undefined : c.meta.expectedText, role, meta: c.meta })
  wanted.delete(c.meta.id)
}
assert.equal(wanted.size, 0)
let readers = { baseline: prior, candidate: current }
const binaries = {}
if (mode === 'wasm') {
  const { loadWasm } = await load(`${root}/dist/wasm.js`)
  const baselineBytes = readFileSync(oldWasm), candidateBytes = readFileSync(`${root}/dist/qr.wasm`)
  assert.equal(hash(baselineBytes), '022993bfb6895152421aaf22673484c8d6fb60be3edae44d5eb85c927f28e326')
  assert.equal(baselineBytes.length, 261831)
  assert.equal(hash(candidateBytes), JSON.parse(readFileSync(`${root}/wasm/manifest.json`, 'utf8')).sha256)
  readers = { baseline: await loadWasm(baselineBytes), candidate: await loadWasm(candidateBytes) }
  binaries.baseline = { sha256: hash(baselineBytes), bytes: baselineBytes.length }
  binaries.candidate = { sha256: hash(candidateBytes), bytes: candidateBytes.length }
}
const identity = Object.fromEntries(readdirSync(`${root}/dist`).filter(n => n.endsWith('.js')).sort().map(n => [n, hash(readFileSync(`${root}/dist/${n}`))]))
const result = { mode, binaries, node: process.version, arch: process.arch, platform: platform(), cpu: model, loadBefore: loadavg(), candidateGenerated: identity, runnerSha256: hash(readFileSync(new URL(import.meta.url))), fixtureSourceSha256: hash(readFileSync(`${root}/scripts/comparison-fixtures.mjs`)), warmupMinimumPairs: 10, warmupMinimumMs: 500, measuredPairs: 60, workNote: 'Legacy Work excludes terminal enlargement and its separate ordinary search.', cases: [] }
if (mode === 'wasm') result.linearCapacityBytesBefore = Object.fromEntries(Object.entries(readers).map(([name, reader]) => [name, reader.memoryBytes]))
try {
  for (const frame of fixtures) {
    const before = hash(frame.data), references = {}, samples = { baseline: [], candidate: [] }
    for (const [name, reader] of Object.entries(readers)) {
      const value = reader.decode(frame)
      const expected = frame.role === 'gain' && name === 'baseline' ? undefined : frame.expected
      assert.equal(value?.text, expected, `${frame.name}/${name}`)
      if (value) assert.deepEqual(Array.from(value.bytes), Array.from(new TextEncoder().encode(expected)))
      references[name] = value
      assert.equal(hash(frame.data), before)
    }
    if (references.baseline) assert.deepEqual(references.candidate, references.baseline)
    const pair = (round, measured) => {
      for (const name of round % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline']) {
        const start = performance.now()
        const value = readers[name].decode(frame)
        const elapsed = performance.now() - start
        assert.deepEqual(value, references[name])
        assert.equal(hash(frame.data), before)
        if (measured) samples[name].push(elapsed)
      }
    }
    let rounds = 0
    const started = performance.now()
    while (rounds < 10 || performance.now() - started < 500) pair(rounds++, false)
    for (let round = 0; round < 60; round++) pair(round, true)
    const entry = { name: frame.name, role: frame.role, meta: frame.meta, pixelSha256: before, width: frame.width, height: frame.height, warmupPairs: rounds, ...Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { ...summary(values), samplesMs: values }])) }
    result.cases.push(entry)
    console.log(JSON.stringify({ name: frame.name, role: frame.role, baseline: summary(samples.baseline), candidate: summary(samples.candidate) }))
  }
  if (mode === 'wasm') result.linearCapacityBytesAfter = Object.fromEntries(Object.entries(readers).map(([name, reader]) => [name, reader.memoryBytes]))
  result.loadAfter = loadavg()
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
} finally {
  if (mode === 'wasm') for (const reader of Object.values(readers)) reader.dispose()
}
