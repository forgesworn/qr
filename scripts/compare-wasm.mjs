// Paired complete-result checks and timings for two modules with the current ABI.
// Build first, then: node scripts/compare-wasm.mjs before.wasm after.wasm [--negative]
// With one argument, compares the packaged module against that candidate.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { loadavg, cpus } from 'node:os'
import { execFileSync } from 'node:child_process'
import { loadWasm, wasmUrl } from '../dist/wasm.js'
import { encode } from '../dist/index.js'
import { timingFrames, rgba, summary } from './comparison-fixtures.mjs'
const args = process.argv.slice(2).filter(arg => arg !== '--negative')
assert(args.length === 1 || args.length === 2, 'Supply a candidate, or a before and after .wasm file')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const binaries = {
  before: readFileSync(args.length === 2 ? args[0] : new URL(wasmUrl)),
  after: readFileSync(args.at(-1)),
}
const modules = Object.fromEntries(await Promise.all(Object.entries(binaries).map(async ([name, bytes]) => [name, await loadWasm(bytes)])))
const frames = timingFrames(encode)
if (process.argv.includes('--negative')) {
  for (const [width, height] of [[512, 512], [1280, 720], [1920, 1080]]) {
    for (const seed of [0x49ad7e32, 0x0fe13bc9]) {
      let state = seed
      const data = Uint8Array.from({ length: width * height }, () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state >>> 24
      })
      frames.push({ name: `noise-${width}x${height}-${seed.toString(16)}`, ...rgba({ data, width, height }) })
    }
  }
  for (const pattern of ['stripes', 'checkerboard', 'gradient']) {
    const width = 1280, height = 720, data = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      data[y * width + x] = pattern === 'gradient' ? Math.round(255 * (x + y) / (width + height - 2))
        : pattern === 'stripes' ? (Math.floor(x / 3) % 2 ? 230 : 25)
        : (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 230 : 25
    }
    frames.push({ name: pattern, ...rgba({ data, width, height }) })
  }
}
const result = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version, arch: process.arch, cpu: cpus()[0]?.model, loadBefore: loadavg(),
  hashes: Object.fromEntries(Object.entries(binaries).map(([name, bytes]) => [name, hash(bytes)])),
  bytes: Object.fromEntries(Object.entries(binaries).map(([name, bytes]) => [name, bytes.length])),
  harnessSha256: hash(readFileSync(new URL(import.meta.url))),
  fixturesSha256: hash(readFileSync(new URL('./comparison-fixtures.mjs', import.meta.url))),
  minimumWarmup: 20, minimumWarmupMs: 1000, rounds: 60,
  validation: 'Complete results and unchanged frame bytes; outside timing', rows: [],
}
try {
  for (const frame of frames) {
    const rgbaSha256 = hash(frame.data)
    const expected = modules.before.decode(frame)
    assert.equal(expected?.text, frame.expected, frame.name)
    if (frame.expected) assert.deepEqual(expected.bytes, new TextEncoder().encode(frame.expected))
    const samples = { before: [], after: [] }
    const runPair = (round, measured) => {
      for (const name of round % 2 === 0 ? ['before', 'after'] : ['after', 'before']) {
        const start = performance.now(), got = modules[name].decode(frame), elapsed = performance.now() - start
        assert.deepEqual(got, expected, frame.name + '/' + name)
        assert.equal(hash(frame.data), rgbaSha256, 'Decoder mutated frame: ' + frame.name + '/' + name)
        if (measured) samples[name].push(elapsed)
      }
    }
    let warmupRounds = 0
    const warmupStart = performance.now()
    while (warmupRounds < result.minimumWarmup || performance.now() - warmupStart < result.minimumWarmupMs) runPair(warmupRounds++, false)
    for (let round = 0; round < result.rounds; round++) runPair(round, true)
    result.rows.push({ name: frame.name, width: frame.width, height: frame.height, rgbaSha256, warmupRounds,
      ...Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { ...summary(values), samplesMs: values }])) })
  }
  result.loadAfter = loadavg()
  console.log(JSON.stringify(result, null, 2))
} finally { for (const module of Object.values(modules)) module.dispose() }
