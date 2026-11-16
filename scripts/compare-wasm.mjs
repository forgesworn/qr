// Paired complete-result checks and timings for two modules with the current ABI.
// Build first, then: node scripts/compare-wasm.mjs before.wasm after.wasm
// With one argument, compares the packaged module against that candidate.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { loadavg, cpus } from 'node:os'
import { execFileSync } from 'node:child_process'
import { loadWasm, wasmUrl } from '../dist/wasm.js'
import { encode } from '../dist/index.js'
import { timingFrames, summary } from './comparison-fixtures.mjs'
if (!process.argv[2]) throw new Error('Supply a candidate, or a before and after .wasm file')
const binaries = {
  before: readFileSync(process.argv[3] ? process.argv[2] : new URL(wasmUrl)),
  after: readFileSync(process.argv[3] ?? process.argv[2]),
}
const modules = Object.fromEntries(await Promise.all(Object.entries(binaries).map(async ([name, bytes]) => [name, await loadWasm(bytes)])))
const result = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version, arch: process.arch, cpu: cpus()[0]?.model, loadBefore: loadavg(),
  hashes: Object.fromEntries(Object.entries(binaries).map(([name, bytes]) => [name, createHash('sha256').update(bytes).digest('hex')])),
  bytes: Object.fromEntries(Object.entries(binaries).map(([name, bytes]) => [name, bytes.length])),
  warmup: 10, rounds: 60, rows: [],
}
try {
  for (const frame of timingFrames(encode)) {
    const expected = modules.before.decode(frame)
    assert.equal(expected?.text, frame.expected)
    const samples = { before: [], after: [] }
    for (let round = -10; round < 60; round++) {
      for (const name of round % 2 === 0 ? ['before', 'after'] : ['after', 'before']) {
        const start = performance.now(), got = modules[name].decode(frame), elapsed = performance.now() - start
        assert.deepEqual(got, expected)
        if (round >= 0) samples[name].push(elapsed)
      }
    }
    result.rows.push({ name: frame.name, ...Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { ...summary(values), samplesMs: values }])) })
  }
  result.loadAfter = loadavg()
  console.log(JSON.stringify(result, null, 2))
} finally { for (const module of Object.values(modules)) module.dispose() }
