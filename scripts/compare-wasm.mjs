// Compare an experimental module without changing the packaged asset.
// node scripts/compare-wasm.mjs /path/to/candidate.wasm > wasm-comparison.json
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { loadavg, cpus } from 'node:os'
import { execFileSync } from 'node:child_process'
import { loadWasm, wasmUrl } from '../dist/wasm.js'
import { encode } from '../dist/index.js'
import { timingFrames, summary } from './comparison-fixtures.mjs'

if (!process.argv[2]) throw new Error('Supply a candidate .wasm file')
const binaries = [readFileSync(new URL(wasmUrl)), readFileSync(process.argv[2])]
const modules = await Promise.all(binaries.map(loadWasm))
const result = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version, cpu: cpus()[0]?.model, loadBefore: loadavg(),
  binaries: binaries.map(b => ({ bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') })),
  warmup: 5, rounds: 25, rows: [],
}
try {
  for (const frame of timingFrames(encode)) {
    assert.deepEqual(modules[0].decode(frame), modules[1].decode(frame))
    const samples = [[], []]
    for (let round = -5; round < 25; round++) {
      for (const index of round % 2 ? [0, 1] : [1, 0]) {
        const start = performance.now()
        const value = modules[index].decode(frame)
        const elapsed = performance.now() - start
        assert.equal(value?.text, frame.expected)
        if (round >= 0) samples[index].push(elapsed)
      }
    }
    result.rows.push({ name: frame.name, packaged: summary(samples[0]), candidate: summary(samples[1]) })
  }
  result.loadAfter = loadavg()
  console.log(JSON.stringify(result, null, 2))
} finally { for (const module of modules) module.dispose() }
