// Times the decoder's front end, TypeScript against WebAssembly, in one Node
// process, interleaved, and the native build for reference.
//
//   node rust/bench/timing.mjs --real <dir of .grey files> [--rounds 25]
//        [--wasm <file.wasm>] [--native <example binary>]
//
// Needs `npm ci && npm run build` (dist/) and the release WebAssembly build.
// The real frames are read, never copied: int32 big-endian width, int32
// big-endian height, then one grey byte a pixel.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadFront } from './loader.js'
import { binarise, invert, reductions, thresholds, toLuminance } from '../../dist/binarise.js'
import { edgesOf, findFinders } from '../../dist/locate.js'
import { encode } from '../../dist/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const rounds = Number(option('--rounds', '25'))
const wasmPath = resolve(option('--wasm', join(here, '../target/wasm32-unknown-unknown/release/forgesworn_qr.wasm')))
const nativePath = option('--native', undefined)
const realDir = option('--real', undefined)
if (rounds < 25) throw new RangeError('At least 25 rounds')

// The decoder's front end on a frame that yields no finder triple.
function pass(grey) {
  const levels = thresholds(grey)
  const bits = binarise(grey, levels)
  const edges = edgesOf(bits)
  let n = 0
  n += findFinders(bits, 0.5, undefined, edges).length
  n += findFinders(bits, 0.8, undefined, edges).length
  const inverse = invert(bits)
  n += findFinders(inverse, 0.5, undefined, edges).length
  n += findFinders(inverse, 0.8, undefined, edges).length
  return n
}

function typescriptFront(data, width, height, channels) {
  const grey = toLuminance(data, width, height, channels)
  let total = pass(grey)
  const shrunk = reductions(grey)
  for (const f of [8, 4, 2]) {
    if (Math.floor(width / f) < 21 || Math.floor(height / f) < 21) continue
    total += pass(shrunk(f))
  }
  return total
}

// Frames.
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
  const grey = new Uint8Array(W * H)
  let s = 3
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      grey[y * W + x] = Math.round(128 + 60 * Math.sin(x / 37) * Math.cos(y / 23) + (s >>> 28))
    }
  }
  frames.push({ name: 'textured', width: W, height: H, channels: 4, data: rgba(grey) })
}

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

if (realDir) {
  const names = readdirSync(realDir).sort()
  names.filter((_, i) => i % 13 === 0).slice(0, 20).forEach((file, i) => {
    const bytes = readFileSync(join(realDir, file))
    const width = bytes.readInt32BE(0)
    const height = bytes.readInt32BE(4)
    if (bytes.length !== 8 + width * height) throw new RangeError(`${file}: unexpected length`)
    frames.push({ name: `real-${String(i + 1).padStart(2, '0')}`, width, height, channels: 1, data: new Uint8Array(bytes.buffer, bytes.byteOffset + 8, width * height) })
  })
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const { front } = await loadFront(wasmPath)

const uptime = () => execFileSync('uptime', { encoding: 'utf8' }).trim()
const uptimeBefore = uptime()

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
    writeFileSync(join(dir, `${String(i).padStart(2, '0')}-${f.name}.frame`), Buffer.concat([head, f.data]))
  })
  try {
    const out = execFileSync(nativePath, [dir, String(rounds)], { encoding: 'utf8' })
    for (const line of out.trim().split('\n')) {
      const [name, ms, count] = line.split('\t')
      native.set(name.slice(3), { ms: Number(ms), count: Number(count) })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log(`uptime before: ${uptimeBefore}`)
console.log(`node ${process.version} ${process.arch}; ${rounds} rounds, median, interleaved\n`)
console.log(['frame', 'size', 'candidates', 'TypeScript ms', 'WebAssembly ms', 'wasm/TS', 'native ms'].join('\t'))

let mismatches = 0
for (const f of frames) {
  const ts = []
  const wasm = []
  let tsCount = 0
  let wasmCount = 0
  for (let r = -3; r < rounds; r++) {
    const runTs = () => {
      const t = performance.now()
      tsCount = typescriptFront(f.data, f.width, f.height, f.channels)
      if (r >= 0) ts.push(performance.now() - t)
    }
    const runWasm = () => {
      const t = performance.now()
      wasmCount = front(f.data, f.width, f.height, f.channels)
      if (r >= 0) wasm.push(performance.now() - t)
    }
    if (r % 2 === 0) {
      runTs()
      runWasm()
    } else {
      runWasm()
      runTs()
    }
  }
  const nat = native.get(f.name)
  const agree = tsCount === wasmCount && (nat === undefined || nat.count === tsCount)
  if (!agree) mismatches++
  const t = median(ts)
  const w = median(wasm)
  console.log([f.name, `${f.width}x${f.height}`, `${tsCount}${agree ? '' : ` MISMATCH (wasm ${wasmCount}${nat ? `, native ${nat.count}` : ''})`}`, t.toFixed(2), w.toFixed(2), (w / t).toFixed(2), nat ? nat.ms.toFixed(2) : '-'].join('\t'))
}
console.log(`\nfinder counts ${mismatches === 0 ? 'agree on every frame (TypeScript, WebAssembly' + (nativePath ? ' and native)' : ')') : `DISAGREE on ${mismatches} frame(s)`}`)
console.log(`uptime after: ${uptime()}`)
process.exitCode = mismatches === 0 ? 0 : 1
