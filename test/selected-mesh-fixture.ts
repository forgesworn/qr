import { encode } from '../src/encode.js'

/** Own-encoder counterparts of two frozen same-call mesh recovery pictures. */
export function selectedMeshPicture(index: 42 | 39) {
  const version = index === 42 ? 17 : 21
  const scale = 2
  const amplitude = index === 42 ? 6 : 3
  const sign = index === 42 ? -1 : 1
  const rotation = index % 4
  const inverted = Math.floor(index / 4) % 2 === 1
  const mirrored = Math.floor(index / 8) % 2 === 1
  const ecc = 'Q' as const
  let state = ((index === 42 ? 0x73ba5 : 0x6d28b4a1) + index * 0x9e3779b9) >>> 0
  let text = `${index === 42 ? 'STARVATION' : 'SELECTED-MESH'}-HOLDOUT-${index}-`
  for (let k = 0; k < Math.floor(version * version * 0.4); k++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    text += '0123456789abcdefghijklmnopqrstuvwxyz'[state % 36]!
  }
  const qr = encode(text, { version, ecc })
  const side = (qr.size + 12) * scale
  let data = new Uint8Array(side * side)
  for (let py = 0; py < side; py++) for (let px = 0; px < side; px++) {
    let sum = 0
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const x = (px + (dx + 0.5) / 2) / scale - 6
      let y = (py + (dy + 0.5) / 2) / scale - 6
      const u = (x - 3.5) / (qr.size - 7)
      const shape = index === 42 ? 4 * u * (1 - u) : Math.sin(2 * Math.PI * u)
      const h = sign * amplitude * shape
      y = (y - h) / (1 - h / qr.size)
      const ix = Math.floor(x), iy = Math.floor(y)
      sum += ix >= 0 && iy >= 0 && ix < qr.size && iy < qr.size && qr.modules[iy * qr.size + ix] ? 25 : 230
    }
    data[py * side + px] = Math.floor(sum / 4)
  }
  if (mirrored) {
    const next = new Uint8Array(data.length)
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) next[y * side + side - 1 - x] = data[y * side + x]!
    data = next
  }
  for (let r = 0; r < rotation; r++) {
    const next = new Uint8Array(data.length)
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) next[x * side + side - 1 - y] = data[y * side + x]!
    data = next
  }
  if (inverted) data = Uint8Array.from(data, value => 255 - value)
  return { image: { data, width: side, height: side }, text, version, ecc, mirrored, inverted }
}
