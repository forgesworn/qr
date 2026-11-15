// The TypeScript side of the dump comparison: the same lines as
// `examples/dump.rs`, from `decodeCounted`.
//
//   node rust/bench/dump.mjs <dir of .grey files> [both|normal|inverted] > dump-ts.txt
//
// Needs `npm ci && npm run build` (dist/). Each file is read, never copied:
// int32 big-endian width, int32 big-endian height, then one grey byte a pixel.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeCounted } from '../../dist/decode.js'

const dir = process.argv[2]
const inversion = process.argv[3] ?? 'both'
if (!dir) throw new TypeError('a directory of .grey files')

const floats = new Float64Array(1)
const bits = new BigInt64Array(floats.buffer)
const text = (p) => {
  if (p === undefined) return '-'
  floats[0] = p.x
  const x = bits[0]
  floats[0] = p.y
  return `${x}:${bits[0]}`
}

function rotate(data, width, height, turn) {
  if (turn === 0) return { data, width, height }
  const out = new Uint8Array(data.length)
  if (turn === 2) {
    for (let i = 0; i < data.length; i++) out[i] = data[data.length - 1 - i]
    return { data: out, width, height }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Turn 1: (x, y) goes to (h - 1 - y, x). Turn 3: (x, y) goes to (y, w - 1 - x).
      const at = turn === 1 ? x * height + (height - 1 - y) : (width - 1 - x) * height + y
      out[at] = data[y * width + x]
    }
  }
  return { data: out, width: height, height: width }
}

const lines = []
for (const name of readdirSync(dir).filter((n) => n.endsWith('.grey')).sort()) {
  const bytes = readFileSync(join(dir, name))
  const width = bytes.readInt32BE(0)
  const height = bytes.readInt32BE(4)
  if (bytes.length !== 8 + width * height) throw new RangeError(`${name}: unexpected length`)
  const grey = new Uint8Array(bytes.buffer, bytes.byteOffset + 8, width * height)
  for (let turn = 0; turn < 4; turn++) {
    const image = rotate(grey, width, height, turn)
    const work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    const r = decodeCounted(image, { channels: 1, inversion }, work)
    const head = `${name} q${turn}`
    const tail = `w ${work.steps} ${work.compared} ${work.scanned} ${work.maps} ${work.second} ${work.meshes} ${work.probed} ${work.reduced ?? 0}`
    if (r === undefined) {
      lines.push(`${head} - vnull null mnull cnull null null - - - - ${tail}`)
      continue
    }
    const hex = Buffer.from(r.bytes).toString('hex') || '-'
    const l = r.location
    lines.push(`${head} ${hex} v${r.version} ${r.ecc} m${r.mask} c${r.corrected} ${r.mirrored} ${r.inverted} ${text(l.topLeft)} ${text(l.topRight)} ${text(l.bottomLeft)} ${text(l.alignment)} ${tail}`)
  }
}
process.stdout.write(lines.join('\n') + '\n')
