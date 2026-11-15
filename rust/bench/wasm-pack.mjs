// The pictures of the conformance pack through the WebAssembly module: the
// result (every field, text included, and the location exactly) and all eight
// work counters against the pack's `result` and `work`.
//
//   node rust/bench/wasm-pack.mjs [wasm file]
//
// Exits 1 on any difference, printing each.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadFront } from './loader.js'
import { readPng } from './png.mjs'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const wasm = process.argv[2] ?? here('../target/wasm32-unknown-unknown/release/forgesworn_qr.wasm')
const vectors = here('../../vectors/')
const pack = JSON.parse(readFileSync(vectors + 'conformance.json', 'utf8'))
const { decodeFull, lastWork } = await loadFront(wasm)

const hex = (bytes) => Buffer.from(bytes).toString('hex')
let differences = 0
const differ = (file, what, got, want) => {
  differences++
  console.log(`DIFFERENCE ${file}: ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}
const same = (file, what, got, want) => {
  if (!Object.is(got, want)) differ(file, what, got, want)
}
const point = (file, what, got, want) => {
  if (want === null || want === undefined) return same(file, what, got, undefined)
  if (got === undefined) return differ(file, what, got, want)
  same(file, `${what}.x`, got.x, want[0])
  same(file, `${what}.y`, got.y, want[1])
}

let read = 0
let nothing = 0
let counters = 0
for (const frame of pack.frames) {
  const file = frame.file
  const image = readPng(readFileSync(vectors + file))
  const got = decodeFull(image.data, image.width, image.height, { channels: 1 })
  const work = lastWork()
  for (const name of Object.keys(frame.work)) {
    same(file, `work.${name}`, work[name], frame.work[name])
    counters++
  }
  const want = frame.result
  if (want === null) {
    if (got !== undefined) differ(file, 'result', 'a reading', null)
    nothing++
    continue
  }
  if (got === undefined) {
    differ(file, 'result', null, 'a reading')
    continue
  }
  read++
  same(file, 'bytes', hex(got.bytes), want.bytes)
  same(file, 'text', got.text, want.text)
  same(file, 'version', got.version, want.version)
  same(file, 'ecc', got.ecc, want.ecc)
  same(file, 'mask', got.mask, want.mask)
  same(file, 'eci', JSON.stringify(got.eci), JSON.stringify(want.eci))
  same(file, 'corrected', got.corrected, want.corrected)
  same(file, 'mirrored', got.mirrored, want.mirrored)
  same(file, 'inverted', got.inverted, want.inverted)
  same(file, 'structuredAppend', JSON.stringify(got.structuredAppend), JSON.stringify(want.structuredAppend))
  same(file, 'fnc1', JSON.stringify(got.fnc1), JSON.stringify(want.fnc1))
  point(file, 'topLeft', got.location.topLeft, want.location.topLeft)
  point(file, 'topRight', got.location.topRight, want.location.topRight)
  point(file, 'bottomLeft', got.location.bottomLeft, want.location.bottomLeft)
  point(file, 'alignment', got.location.alignment, want.location.alignment)
}
console.log(`pack pictures: ${pack.frames.length} frames, ${read} read and ${nothing} read nothing, ${counters} counters compared, ${differences} differences`)
process.exit(differences === 0 ? 0 : 1)
