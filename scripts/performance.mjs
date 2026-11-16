// Build first. Compare with a preserved build using --baseline /path/to/dist.
// No rival libraries are installed or included in the distributed package.
import { deepStrictEqual } from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { cpus, loadavg, platform } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const rounds = Number(option('--rounds', 25))
if (!Number.isInteger(rounds) || rounds < 25) throw new RangeError('Use at least 25 rounds')
const suite = option('--suite', 'all')
if (!['all', 'encode', 'decode'].includes(suite)) throw new RangeError('Unknown suite')
const currentPath = resolve('dist')
const baselinePath = option('--baseline', undefined)
const current = await import(pathToFileURL(currentPath + '/index.js'))
const baseline = baselinePath ? await import(pathToFileURL(resolve(baselinePath, 'index.js'))) : undefined
const identity = (directory) => {
  const hash = createHash('sha256')
  for (const file of readdirSync(directory).filter(n => n.endsWith('.js')).sort()) {
    hash.update(file).update(readFileSync(resolve(directory, file)))
  }
  return hash.digest('hex')
}
const cases = []
if (suite !== 'decode') {
  for (const [name, data, options] of [
    ['url', 'https://example.com/performance/0123456789', {}],
    ['mixed', 'lightning:LNBC' + '0123456789ACDEFGHJKLMNPQRSTUVWXYZ'.repeat(8), {}],
    ['numeric', '0123456789'.repeat(100), {}],
    ['bytes-v40', new Uint8Array(1200).fill(97), { version: 40 }],
  ]) cases.push({ name: 'encode/' + name, run: lib => lib.encode(data, options), iterations: 10 })
}
if (suite !== 'encode') {
  const width = 1280, height = 720
  const text = 'https://example.com/performance/0123456789'
  const code = current.encode(text)
  const clean = new Uint8Array(width * height).fill(230)
  for (let y = 0; y < code.size; y++) for (let x = 0; x < code.size; x++) {
    if (!code.modules[y * code.size + x]) continue
    for (let dy = 0; dy < 9; dy++) clean.fill(25, (150 + y * 9 + dy) * width + 400 + x * 9, (150 + y * 9 + dy) * width + 409 + x * 9)
  }
  let seed = 5
  const noise = Uint8Array.from({ length: width * height }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed >>> 24
  })
  for (const [name, grey] of [['clean', clean], ['blank', new Uint8Array(width * height).fill(200)], ['noise', noise]]) {
    for (const channels of [1, 4]) {
      const data = channels === 1 ? grey : new Uint8ClampedArray(width * height * 4)
      if (channels === 4) for (let i = 0; i < grey.length; i++) {
        data[4 * i] = data[4 * i + 1] = data[4 * i + 2] = grey[i]
        data[4 * i + 3] = 255
      }
      const frame = { data, width, height }
      const found = current.decode(frame)
      deepStrictEqual(found?.text, name === 'clean' ? text : undefined)
      cases.push({ name: `decode/${name}/${channels === 1 ? 'grey' : 'rgba'}`, run: lib => lib.decode(frame), iterations: 1 })
    }
  }
}
const summary = values => {
  values.sort((a, b) => a - b)
  return { medianMs: values[Math.floor(values.length / 2)], p95Ms: values[Math.ceil(values.length * 0.95) - 1] }
}
const before = loadavg()
const rows = []
let consumed = 0
for (const c of cases) {
  if (baseline) deepStrictEqual(c.run(current), c.run(baseline), c.name + ' full result differs')
  const samples = { current: [], baseline: [] }
  for (let round = -5; round < rounds; round++) {
    for (const name of round % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
      const lib = name === 'current' ? current : baseline
      if (!lib) continue
      const start = performance.now()
      for (let i = 0; i < c.iterations; i++) {
        const value = c.run(lib)
        consumed += value?.version ?? 0
      }
      if (round >= 0) samples[name].push((performance.now() - start) / c.iterations)
    }
  }
  const row = { name: c.name, current: summary(samples.current) }
  if (baseline) {
    row.baseline = summary(samples.baseline)
    row.speedup = row.baseline.medianMs / row.current.medianMs
  }
  rows.push(row)
}
console.log(JSON.stringify({
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
  currentSha256: identity(currentPath), baselineSha256: baselinePath ? identity(baselinePath) : undefined,
  cpu: cpus()[0]?.model, platform: platform(), node: process.version, rounds,
  warmupRounds: 5, loadBefore: before, loadAfter: loadavg(), consumed, rows,
}, null, 2))
