import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { pathToFileURL } from 'node:url'

const [root, baselinePath, candidatePath] = process.argv.slice(2)
assert(root && baselinePath && candidatePath)
const baseline = await import(pathToFileURL(`${baselinePath}/index.js`))
const candidate = await import(pathToFileURL(`${candidatePath}/index.js`))
const { timingFrames, summary } = await import(pathToFileURL(`${root}/scripts/comparison-fixtures.mjs`))
function identity(dir) {
  const hash = createHash('sha256')
  for (const file of readdirSync(dir).filter(f => f.endsWith('.js')).sort()) hash.update(file).update(readFileSync(`${dir}/${file}`))
  return hash.digest('hex')
}
const loadBefore = loadavg(), cases = []
for (const frame of timingFrames(baseline.encode)) {
  const samples = { baseline: [], candidate: [] }
  const readers = { baseline, candidate }
  for (let round = -5; round < 25; round++) {
    for (const name of round % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline']) {
      const start = performance.now(), result = readers[name].decode(frame), ms = performance.now() - start
      assert.equal(result?.text, frame.expected)
      if (frame.expected) assert.deepEqual(result.bytes, new TextEncoder().encode(frame.expected))
      if (round >= 0) samples[name].push(ms)
    }
  }
  cases.push({ name: frame.name, pixelSha256: createHash('sha256').update(frame.data).digest('hex'), ...Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { ...summary(values), samplesMs: values }])) })
}
console.log(JSON.stringify({ cpu: cpus()[0]?.model, node: process.version, arch: process.arch, warmup: 5, rounds: 25, loadBefore, loadAfter: loadavg(), baselineJavascriptSha256: identity(baselinePath), candidateJavascriptSha256: identity(candidatePath), cases }, null, 2))
