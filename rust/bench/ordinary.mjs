// Times the ordinary search, TypeScript `decode` against the WebAssembly
// `ordinary` export, in one Node process, interleaved, with the native build
// for reference.
//
//   node rust/bench/ordinary.mjs [--real <dir of .grey files>] [--rounds 25]
//        [--wasm <file.wasm>] [--native <native_ordinary binary>]
//
// Needs `npm ci && npm run build` (dist/) and the release WebAssembly build.
// The real frames are read, never copied: int32 big-endian width, int32
// big-endian height, then one grey byte a pixel. Every fifth file by name is a
// candidate, kept only if the TypeScript reads it by the ordinary search alone
// (no second look, no reduced pass), up to 30 frames.
//
// The WebAssembly time includes copying the frame into its memory. Each side
// must read a payload of the same length, or the run reports a mismatch.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadFront } from './loader.js'
import { decode, encode } from '../../dist/index.js'
import { decodeCounted } from '../../dist/decode.js'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const rounds = Number(option('--rounds', '25'))
const wasmPath = resolve(option('--wasm', join(here, '../target/wasm32-unknown-unknown/release/forgesworn_qr.wasm')))
const nativePath = option('--native', undefined)
const realDir = option('--real', undefined)
if (!(rounds >= 25)) throw new RangeError('At least 25 rounds')

const frames = []

// (a) A clean code in a 1280 x 720 RGBA frame.
{
  const W = 1280
  const H = 720
  const code = encode('https://example.com/timing/0123456789', { ecc: 'M' })
  const grey = new Uint8Array(W * H).fill(230)
  for (let my = 0; my < code.size; my++) {
    for (let mx = 0; mx < code.size; mx++) {
      if (code.modules[my * code.size + mx] !== 1) continue
      for (let y = 0; y < 9; y++) grey.fill(25, (150 + my * 9 + y) * W + 400 + mx * 9, (150 + my * 9 + y) * W + 400 + mx * 9 + 9)
    }
  }
  const data = new Uint8Array(W * H * 4)
  for (let i = 0; i < W * H; i++) data.set([grey[i], grey[i], grey[i], 255], i * 4)
  frames.push({ group: 'clean', name: `code-v${code.version}`, width: W, height: H, channels: 4, data })
}

// (b) Real greyscale frames.
let candidates = 0
if (realDir) {
  const names = readdirSync(realDir).sort()
  for (let i = 0; i < names.length && frames.length < 31; i += 5) {
    candidates++
    const bytes = readFileSync(join(realDir, names[i]))
    const width = bytes.readInt32BE(0)
    const height = bytes.readInt32BE(4)
    if (bytes.length !== 8 + width * height) throw new RangeError(`${names[i]}: unexpected length`)
    const data = new Uint8Array(bytes.buffer, bytes.byteOffset + 8, width * height)
    const work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    const result = decodeCounted({ data, width, height }, {}, work)
    if (!result || work.second !== 0 || work.reduced !== 0) continue
    frames.push({ group: 'real', name: names[i].replace(/\.grey$/, ''), width, height, channels: 1, data })
  }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const { ordinary } = await loadFront(wasmPath)

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
      const [name, ms, read] = line.split('\t')
      native.set(name.slice(3), { ms: Number(ms), read: Number(read) })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log(`uptime before: ${uptimeBefore}`)
console.log(`node ${process.version} ${process.arch}; ${rounds} rounds after 3 warm-ups, median, interleaved`)
console.log(`real frames: every 5th file of ${realDir ?? '(none)'}; ${candidates} tried, ${frames.length - 1} kept (read by the ordinary search alone)\n`)
console.log(['frame', 'size', 'payload+1', 'TypeScript ms', 'WebAssembly ms', 'wasm/TS', 'native ms'].join('\t'))

let mismatches = 0
const ratios = { clean: [], real: [] }
for (const f of frames) {
  const image = { data: f.data, width: f.width, height: f.height }
  const options = { channels: f.channels }
  const ts = []
  const wasm = []
  let tsRead = 0
  let wasmRead = 0
  for (let r = -3; r < rounds; r++) {
    const runTs = () => {
      const t = performance.now()
      const result = decode(image, options)
      if (r >= 0) ts.push(performance.now() - t)
      tsRead = result ? result.bytes.length + 1 : 0
    }
    const runWasm = () => {
      const t = performance.now()
      wasmRead = ordinary(f.data, f.width, f.height, f.channels)
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
  const agree = tsRead > 0 && tsRead === wasmRead && (nat === undefined || nat.read === tsRead)
  if (!agree) mismatches++
  const t = median(ts)
  const w = median(wasm)
  ratios[f.group].push(w / t)
  console.log([f.name, `${f.width}x${f.height}`, `${tsRead}${agree ? '' : ` MISMATCH (wasm ${wasmRead}${nat ? `, native ${nat.read}` : ''})`}`, t.toFixed(2), w.toFixed(2), (w / t).toFixed(2), nat ? nat.ms.toFixed(2) : '-'].join('\t'))
}
for (const [group, list] of Object.entries(ratios)) {
  if (list.length > 0) console.log(`\nmedian wasm/TS, ${group} (${list.length} frame${list.length === 1 ? '' : 's'}): ${median(list).toFixed(2)}`)
}
console.log(`\npayload lengths ${mismatches === 0 ? 'agree on every frame (TypeScript, WebAssembly' + (nativePath ? ' and native)' : ')') : `DISAGREE on ${mismatches} frame(s)`}`)
console.log(`uptime after: ${uptime()}`)
process.exitCode = mismatches === 0 ? 0 : 1
