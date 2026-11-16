// Paired complete-result comparison of two independently built TypeScript revisions.
// node scripts/compare-typescript.mjs /path/to/before/dist /path/to/after/dist [--negative]
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { timingFrames, rgba, summary } from './comparison-fixtures.mjs'

assert(process.argv[2] && process.argv[3], 'Supply baseline and candidate dist directories')
const directories = { before: realpathSync(resolve(process.argv[2])), after: realpathSync(resolve(process.argv[3])) }
assert.notEqual(directories.before, directories.after, 'Builds must have distinct module identities')
const readers = Object.fromEntries(await Promise.all(Object.entries(directories).map(async ([name, directory]) =>
  [name, await import(pathToFileURL(directory + '/index.js'))])))
assert.notEqual(readers.before.decode, readers.after.decode, 'Decoders must be independently loaded')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
function buildHash(directory) {
  const digest = createHash('sha256')
  for (const file of readdirSync(directory).filter(f => f.endsWith('.js')).sort()) digest.update(file).update(readFileSync(directory + '/' + file))
  return digest.digest('hex')
}
const frames = timingFrames(readers.before.encode)
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
  node: process.version, arch: process.arch, cpu: cpus()[0]?.model, loadBefore: loadavg(),
  javascriptSha256: Object.fromEntries(Object.entries(directories).map(([name, directory]) => [name, buildHash(directory)])),
  harnessSha256: hash(readFileSync(new URL(import.meta.url))),
  fixturesSha256: hash(readFileSync(new URL('./comparison-fixtures.mjs', import.meta.url))),
  minimumWarmup: 20, minimumWarmupMs: 1000, rounds: 60,
  validation: 'Complete results and unchanged frame bytes; outside timing', rows: [],
}
for (const frame of frames) {
  const rgbaSha256 = hash(frame.data)
  const expected = readers.before.decode(frame)
  assert.equal(expected?.text, frame.expected, frame.name)
  if (frame.expected) assert.deepEqual(expected.bytes, new TextEncoder().encode(frame.expected))
  const samples = { before: [], after: [] }
  const runPair = (round, measured) => {
    for (const name of round % 2 === 0 ? ['before', 'after'] : ['after', 'before']) {
      const start = performance.now(), got = readers[name].decode(frame), elapsed = performance.now() - start
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
