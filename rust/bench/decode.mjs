// Times the whole decoder, TypeScript `decode` against the WebAssembly
// `decodeFull` (input copy and complete result extraction included), and the native build
// for reference, interleaved in one Node process.
//
//   node rust/bench/decode.mjs --real <dir of .grey files> [--rounds 15]
//        [--wasm <file.wasm>] [--native <example binary>]
//
// Needs `npm ci && npm run build` (dist/) and the release WebAssembly build.
// Frames: a blank 1280x720 RGBA picture, a clean code, noise, and every
// fourth real frame by name. The real frames are read, never copied: int32
// big-endian width, int32 big-endian height, then one grey byte a pixel.

import { deepStrictEqual } from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadFront } from './loader.js'
import { decode } from '../../dist/decode.js'
import { encode } from '../../dist/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const rounds = Number(option('--rounds', '15'))
const wasmPath = resolve(option('--wasm', join(here, '../target/wasm32-unknown-unknown/release/forgesworn_qr.wasm')))
const nativePath = option('--native', undefined)
const realDir = option('--real', undefined)
if (!(rounds >= 15)) throw new RangeError('At least 15 rounds')

const W = 1280
const H = 720
const rgba = (grey) => {
  const out = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) out.set([grey[i], grey[i], grey[i], 255], i * 4)
  return out
}
const frames = []

frames.push({ name: 'blank', width: W, height: H, channels: 4, data: rgba(new Uint8Array(W * H).fill(200)) })

{
  const code = encode('https://example.com/timing/0123456789', { ecc: 'M' })
  const grey = new Uint8Array(W * H).fill(230)
  for (let my = 0; my < code.size; my++) {
    for (let mx = 0; mx < code.size; mx++) {
      if (code.modules[my * code.size + mx] !== 1) continue
      for (let y = 0; y < 9; y++) grey.fill(25, (150 + my * 9 + y) * W + 400 + mx * 9, (150 + my * 9 + y) * W + 400 + mx * 9 + 9)
    }
  }
  frames.push({ name: `code-v${code.version}`, width: W, height: H, channels: 4, data: rgba(grey) })
}

{
  const grey = new Uint8Array(W * H)
  let s = 5
  for (let i = 0; i < W * H; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    grey[i] = s >>> 24
  }
  frames.push({ name: 'noise', width: W, height: H, channels: 4, data: rgba(grey) })
}

if (realDir) {
  const names = readdirSync(realDir).filter((n) => n.endsWith('.grey')).sort()
  names.filter((_, i) => i % 4 === 0).forEach((file) => {
    const bytes = readFileSync(join(realDir, file))
    const width = bytes.readInt32BE(0)
    const height = bytes.readInt32BE(4)
    if (bytes.length !== 8 + width * height) throw new RangeError(`${file}: unexpected length`)
    frames.push({ name: file.replace(/\.grey$/, ''), width, height, channels: 1, data: new Uint8Array(bytes.buffer, bytes.byteOffset + 8, width * height) })
  })
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const { decodeFull: wasmDecode } = await loadFront(wasmPath)
const typescript = (f) => {
  return decode({ data: f.data, width: f.width, height: f.height }, { channels: f.channels })
}

const run = (cmd, argv) => {
  try {
    return execFileSync(cmd, argv, { encoding: 'utf8' }).trim()
  } catch {
    return `${cmd} not found`
  }
}
const uptimeBefore = run('uptime', [])

// Native timing, from frame files in the build folder (not the repository's tracked files).
const native = new Map()
if (nativePath) {
  const dir = resolve(here, '../target/bench-frames')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  frames.forEach((f, i) => {
    const head = Buffer.alloc(12)
    head.writeUInt32BE(f.width, 0)
    head.writeUInt32BE(f.height, 4)
    head.writeUInt32BE(f.channels, 8)
    writeFileSync(join(dir, `${String(i).padStart(3, '0')}-${f.name}.frame`), Buffer.concat([head, f.data]))
  })
  try {
    const out = execFileSync(nativePath, [dir, String(rounds)], { encoding: 'utf8' })
    for (const line of out.trim().split('\n')) {
      const [name, ms, length] = line.split('\t')
      native.set(name.slice(4), { ms: Number(ms), length: Number(length) })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log(`uptime before: ${uptimeBefore}`)
console.log(`node ${process.version} ${process.arch}; ${run('rustc', ['--version'])}; wasm ${statSync(wasmPath).size} bytes`)
console.log(`${rounds} rounds, median, interleaved; length is payload bytes + 1, 0 if unread\n`)
console.log(['frame', 'size', 'length', 'TypeScript ms', 'WebAssembly ms', 'wasm/TS', 'native ms'].join('\t'))

const rows = []
let mismatches = 0
for (const f of frames) {
  const ts = []
  const wasm = []
  let tsLength = 0
  let wasmLength = 0
  let tsResult
  let wasmResult
  for (let r = -2; r < rounds; r++) {
    const runTs = () => {
      const t = performance.now()
      tsResult = typescript(f)
      if (r >= 0) ts.push(performance.now() - t)
      tsLength = tsResult === undefined ? 0 : tsResult.bytes.length + 1
    }
    const runWasm = () => {
      const t = performance.now()
      wasmResult = wasmDecode(f.data, f.width, f.height, { channels: f.channels })
      if (r >= 0) wasm.push(performance.now() - t)
      wasmLength = wasmResult === undefined ? 0 : wasmResult.bytes.length + 1
    }
    if (r % 2 === 0) {
      runTs()
      runWasm()
    } else {
      runWasm()
      runTs()
    }
  }
  // Compare complete results, including text. Unsupported character sets must
  // be benchmarked separately and must not silently pass this comparison.
  deepStrictEqual(wasmResult, tsResult, `${f.name}: full decoded result differs`)
  const nat = native.get(f.name)
  const agree = tsLength === wasmLength && (nat === undefined || nat.length === tsLength)
  if (!agree) mismatches++
  const t = median(ts)
  const w = median(wasm)
  rows.push({ read: tsLength > 0, t, w, n: nat?.ms })
  console.log([f.name, `${f.width}x${f.height}`, `${tsLength}${agree ? '' : ` MISMATCH (wasm ${wasmLength}${nat ? `, native ${nat.length}` : ''})`}`, t.toFixed(2), w.toFixed(2), (w / t).toFixed(2), nat ? nat.ms.toFixed(2) : '-'].join('\t'))
}

console.log('\nsummary\tframes\tmedian TS ms\tmedian wasm ms\tmedian wasm/TS\ttotal TS ms\ttotal wasm ms\ttotal wasm/TS\ttotal native ms')
for (const [label, pick] of [['read', (r) => r.read], ['unread', (r) => !r.read], ['all', () => true]]) {
  const set = rows.filter(pick)
  if (set.length === 0) continue
  const t = set.map((r) => r.t)
  const w = set.map((r) => r.w)
  const n = set.map((r) => r.n)
  console.log([label, set.length, median(t).toFixed(2), median(w).toFixed(2), median(set.map((r) => r.w / r.t)).toFixed(2), sum(t).toFixed(1), sum(w).toFixed(1), (sum(w) / sum(t)).toFixed(2), n.every((x) => x !== undefined) ? sum(n).toFixed(1) : '-'].join('\t'))
}
console.log(`\npayload lengths ${mismatches === 0 ? 'agree on every frame (TypeScript, WebAssembly' + (nativePath ? ' and native)' : ')') : `DISAGREE on ${mismatches} frame(s)`}`)
console.log(`uptime after: ${run('uptime', [])}`)
process.exitCode = mismatches === 0 ? 0 : 1
