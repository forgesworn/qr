// Build first. Diagnostic CPU sampling is separate from competitive timings.
// node scripts/profile-decode.mjs [iterations] [optional-profile.cpuprofile] [optional-module.wasm]
import { Session } from 'node:inspector/promises'
import { writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { cpus, loadavg } from 'node:os'
import { execFileSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { encode } from '../dist/index.js'
import { decodeCounted } from '../dist/decode.js'
import { loadWasm } from '../dist/wasm.js'
import { timingFrames } from './comparison-fixtures.mjs'

const iterations = Number(process.argv[2] ?? 100)
assert(Number.isInteger(iterations) && iterations > 0 && iterations <= 1000)
const frames = timingFrames(encode)
const work = []
for (const frame of frames) {
  const count = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0 }
  assert.equal(decodeCounted(frame, {}, count)?.text, frame.expected)
  work.push({ name: frame.name, ...count })
}
const frame = frames.find(frame => frame.name === 'noise')
const binary = process.argv[4] ? readFileSync(process.argv[4]) : undefined
const wasm = binary ? await loadWasm(binary) : undefined
const read = wasm ? image => wasm.decode(image) : decodeCounted
for (let i = 0; i < 10; i++) assert.equal(read(frame), undefined)
const loadBefore = loadavg()
const inspector = new Session()
inspector.connect()
let profile
try {
  await inspector.post('Profiler.enable')
  await inspector.post('Profiler.setSamplingInterval', { interval: 500 })
  await inspector.post('Profiler.start')
  for (let i = 0; i < iterations; i++) assert.equal(read(frame), undefined)
  profile = (await inspector.post('Profiler.stop')).profile
} finally { inspector.disconnect(); wasm?.dispose() }
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(profile))
const nodes = new Map(profile.nodes.map(node => [node.id, node]))
const parents = new Map()
for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id)
const self = new Map(), inclusive = new Map()
const key = id => {
  const frame = nodes.get(id).callFrame
  const url = frame.url.replace(process.cwd() + '/', '')
  return `${frame.functionName || '(anonymous)'} ${url}:${frame.lineNumber + 1}`
}
for (let i = 0; i < profile.samples.length; i++) {
  let id = profile.samples[i]
  const time = profile.timeDeltas[i]
  self.set(key(id), (self.get(key(id)) ?? 0) + time)
  const seen = new Set()
  while (id !== undefined) {
    const name = key(id)
    if (!seen.has(name)) inclusive.set(name, (inclusive.get(name) ?? 0) + time)
    seen.add(name)
    id = parents.get(id)
  }
}
const total = profile.timeDeltas.reduce((a, b) => a + b, 0)
const top = values => [...values].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, us]) => ({ name, ms: us / 1000, percent: 100 * us / total }))
const hash = createHash('sha256')
for (const file of readdirSync('dist').filter(file => file.endsWith('.js')).sort()) hash.update(file).update(readFileSync('dist/' + file))
console.log(JSON.stringify({
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  javascriptSha256: hash.digest('hex'), node: process.version, arch: process.arch,
  backend: wasm ? 'wasm' : 'typescript',
  wasmSha256: binary ? createHash('sha256').update(binary).digest('hex') : undefined,
  cpu: cpus()[0]?.model, iterations, loadBefore, loadAfter: loadavg(), work,
  sampleDurationMs: total / 1000, self: top(self), inclusive: top(inclusive),
}, null, 2))
