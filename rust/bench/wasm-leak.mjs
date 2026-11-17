// A long run of decodes and grid reads through the module, checking that the
// WebAssembly memory does not grow without bound: the memory size is taken
// after a warm-up, then every 1,000 calls, and again at the end.
//
//   node rust/bench/wasm-leak.mjs [calls] [wasm file]
//
// Exits 1 if the memory grew after the warm-up.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadFront } from './loader.js'
import { readPng } from './png.mjs'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const calls = Number(process.argv[2] ?? 5000)
const wasm = process.argv[3] ?? here('../target/wasm32-unknown-unknown/release/forgesworn_qr.wasm')
const vectors = here('../../vectors/')
const pack = JSON.parse(readFileSync(vectors + 'conformance.json', 'utf8'))
const { decodeFull, decodeGrid, encode, memory } = await loadFront(wasm)

// Small pictures that read, one that does not, and a grid.
const frames = pack.frames.filter((f) => f.result !== null && f.width <= 300).slice(0, 6).map((f) => readPng(readFileSync(vectors + f.file)))
// Exercise the owned deferred grids too, including reduced, inverted and terminal fifth reads.
const meshFrames = ['mesh-reading-16.png', 'mesh-reading-87.png', 'starved-curvature-32.png', 'starved-curvature-84.png', 'starved-curvature-89.png'].map((name) => {
  const frame = pack.frames.find((f) => f.file === 'conformance/' + name)
  if (!frame?.result) throw new Error('Missing mesh memory fixture: ' + name)
  return { image: readPng(readFileSync(vectors + frame.file)), expected: frame.result.text }
})
const blank = readPng(readFileSync(vectors + 'conformance/blank.png'))
const qr = encode('a throwaway payload for the leak run', { ecc: 'Q' })
const bad = new Uint8Array(10)

const size = () => memory.buffer.byteLength
const first = size()
const sizes = []
let read = 0
let nothing = 0
let refused = 0
let meshReads = 0
for (let i = 0; i < calls; i++) {
  const f = frames[i % frames.length]
  if (decodeFull(f.data, f.width, f.height, { channels: 1 })) read++
  if (i % 16 === 0) {
    const { image, expected } = meshFrames[(i / 16) % meshFrames.length]
    if (decodeFull(image.data, image.width, image.height, { channels: 1 })?.text !== expected) {
      throw new Error('Deferred mesh memory fixture failed')
    }
    meshReads++
  }
  if (i % 3 === 0 && decodeFull(blank.data, blank.width, blank.height) === undefined) nothing++
  if (i % 5 === 0) decodeGrid(qr.modules, qr.size)
  if (i % 7 === 0) {
    try {
      decodeFull(bad, 100, 100, { channels: 1 })
    } catch {
      refused++
    }
  }
  if (i === 199) sizes.push(['after warm-up (200 calls)', size()])
  else if ((i + 1) % 1000 === 0) sizes.push([`after ${i + 1} calls`, size()])
}
const last = size()
console.log(`memory before the run: ${first} bytes`)
for (const [when, bytes] of sizes) console.log(`memory ${when}: ${bytes} bytes`)
console.log(`memory at the end: ${last} bytes (${calls} rounds: ${read} frames read, ${meshReads} recovery fixtures read, ${nothing} blank pictures read nothing, ${refused} calls refused)`)
// A control, so that a flat line means something: the same grid read on a fresh instance with
// the handles never given back must make the memory grow.
const { instance } = await WebAssembly.instantiate(readFileSync(wasm), {})
const x = instance.exports
const at = x.alloc(qr.modules.length)
new Uint8Array(x.memory.buffer, at, qr.modules.length).set(qr.modules)
for (let i = 0; i < 200; i++) x.read_grid(at, qr.modules.length, qr.size)
const controlWarm = x.memory.buffer.byteLength
for (let i = 0; i < calls; i++) x.read_grid(at, qr.modules.length, qr.size)
console.log(`control, ${calls} grid reads with the handles never freed: ${controlWarm} bytes after 200, ${x.memory.buffer.byteLength} bytes after ${calls} more`)
const warm = sizes[0][1]
if (last > warm) {
  console.log(`DIFFERENCE: the memory grew from ${warm} to ${last} after the warm-up`)
  process.exit(1)
}
