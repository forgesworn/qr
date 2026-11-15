// The options of `decodeFull` against the TypeScript `decode`, on frames of
// the conformance pack: a row stride wider than the picture (the padding
// filled with noise, which must not be read), 1 and 4 channels, each
// inversion value on a picture and on its negative, channels left to be
// worked out, and arguments the TypeScript throws on.
//
//   node rust/bench/wasm-options.mjs [wasm file]
//
// Needs dist/. Exits 1 on any difference.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeCounted } from '../../dist/decode.js'
import { loadFront } from './loader.js'
import { readPng } from './png.mjs'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))
const wasm = process.argv[2] ?? here('../target/wasm32-unknown-unknown/release/forgesworn_qr.wasm')
const vectors = here('../../vectors/')
const pack = JSON.parse(readFileSync(vectors + 'conformance.json', 'utf8'))
const { decodeFull, lastWork } = await loadFront(wasm)

const floats = new Float64Array(1)
const bits = new BigInt64Array(floats.buffer)
const bitsOf = (n) => {
  floats[0] = n
  return bits[0].toString()
}
const point = (p) => (p === undefined ? '-' : `${bitsOf(p.x)}:${bitsOf(p.y)}`)
const show = (r) =>
  r === undefined
    ? 'nothing'
    : JSON.stringify([
        r.text,
        Buffer.from(r.bytes).toString('hex'),
        r.version,
        r.ecc,
        r.mask,
        r.eci,
        r.corrected,
        r.mirrored,
        r.inverted,
        point(r.location.topLeft),
        point(r.location.topRight),
        point(r.location.bottomLeft),
        point(r.location.alignment),
        r.structuredAppend ?? null,
        r.fnc1 ?? null,
      ])

let checks = 0
let differences = 0
const compare = (label, image, options) => {
  const work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
  let want
  let wantThrew
  try {
    want = show(decodeCounted(image, options, work))
  } catch (e) {
    wantThrew = e.constructor.name
  }
  let got
  let gotThrew
  try {
    got = show(decodeFull(image.data, image.width, image.height, options))
  } catch (e) {
    gotThrew = e.constructor.name
  }
  checks++
  if (wantThrew !== undefined || gotThrew !== undefined) {
    if (wantThrew !== gotThrew) {
      differences++
      console.log(`DIFFERENCE ${label}: the TypeScript ${wantThrew ?? 'returned'}, the module ${gotThrew ?? 'returned'}`)
    }
    return wantThrew === undefined ? want : 'threw'
  }
  const counted = lastWork()
  const countersAgree = Object.keys(work).every((k) => counted[k] === work[k])
  if (got !== want || !countersAgree) {
    differences++
    console.log(`DIFFERENCE ${label}: got ${got.slice(0, 120)} want ${want.slice(0, 120)} counters equal: ${countersAgree}`)
  }
  return want
}

const grey = (file) => readPng(readFileSync(vectors + file))
const padded = (image, stride, channels) => {
  const { data, width, height } = image
  const out = new Uint8Array((stride * (height - 1) + width) * channels)
  let s = 12345
  for (let i = 0; i < out.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    out[i] = s >>> 24
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = data[y * width + x]
      for (let c = 0; c < channels; c++) out[(y * stride + x) * channels + c] = c === 3 ? 255 : v
    }
  }
  return out
}
const negative = (image) => ({ ...image, data: image.data.map((v) => 255 - v) })

// Frames that read (several kinds, including one read only at reduced size and one through the second look),
// and one that does not.
const files = pack.frames.filter((f) => f.result !== null).map((f) => f.file)
const picks = [files[0], files[7], files[20], files[files.length - 1], ...files.filter((f) => f.startsWith('conformance/'))]
const unreadable = pack.frames.find((f) => f.result === null && f.file.includes('noise'))?.file
if (unreadable) picks.push(unreadable)

const seen = new Set()
let reads = 0
for (const file of picks) {
  if (seen.has(file)) continue
  seen.add(file)
  const image = grey(file)
  const { width, height } = image
  for (const [name, picture] of [['', image], ['negative ', negative(image)]]) {
    for (const inversion of [undefined, 'both', 'normal', 'inverted']) {
      for (const channels of [1, 4]) {
        for (const extra of [0, 1, 17]) {
          const stride = width + extra
          const data = extra === 0 && channels === 1 ? picture.data : padded({ ...picture, data: picture.data }, stride, channels)
          const options = { channels, inversion, ...(extra === 0 ? {} : { rowStride: stride }) }
          const r = compare(`${file} ${name}channels ${channels} stride +${extra} inversion ${inversion}`, { data, width, height }, options)
          if (r !== 'nothing' && r !== 'threw') reads++
        }
      }
    }
  }
  // Channels worked out from the data length, as the TypeScript does.
  compare(`${file} channels worked out (RGBA)`, { data: padded(image, width, 4), width, height }, {})
  compare(`${file} channels worked out (grey)`, { data: image.data, width, height }, {})
  compare(`${file} stride worked out (RGBA, wide)`, { data: padded(image, width + 5, 4), width, height }, { rowStride: width + 5 })
}

// What the TypeScript throws on.
const image = grey(files[0])
const { width, height } = image
const rgba = padded(image, width, 4)
compare('three bytes a pixel', { data: new Uint8Array(width * height * 3), width, height }, {})
compare('channels 3', { data: rgba, width, height }, { channels: 3 })
compare('stride under width', { data: rgba, width, height }, { rowStride: width - 1, channels: 4 })
compare('stride not whole', { data: rgba, width, height }, { rowStride: width + 0.5, channels: 4 })
compare('inversion unknown', { data: rgba, width, height }, { inversion: 'sideways', channels: 4 })
compare('data too short', { data: rgba.subarray(0, rgba.length - 4), width, height }, { channels: 4 })
compare('zero width', { data: rgba, width: 0, height }, { channels: 4 })
compare('zero height', { data: rgba, width, height: 0 }, { channels: 4 })
compare('fractional width', { data: rgba, width: width + 0.5, height }, { channels: 4 })
compare('a plain array', { data: Array.from(image.data), width, height }, { channels: 1 })
compare('a Uint8ClampedArray', { data: new Uint8ClampedArray(image.data), width, height }, { channels: 1 })

console.log(`options: ${checks} comparisons with the TypeScript decode (${reads} readings, ${seen.size} frames, and a negative of each), ${differences} differences`)
process.exit(differences === 0 ? 0 : 1)
