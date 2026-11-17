import { encode, type ErrorCorrection } from '../src/encode.js'

/** Own-encoder counterparts of five independently generated sparse-curvature regressions. */
export function quadraticMeshPicture(group: 'starvation' | 'alternate' | 'header', index: 16 | 18, inverted = false, mirrored = false) {
  const version = group === 'alternate' ? 7 : 9
  const scale = 3
  const ecc: ErrorCorrection = group === 'header' ? (index === 16 ? 'M' : 'H') : (index === 16 ? 'M' : 'Q')
  const prefix = group === 'starvation' ? 'STARVATION' : group === 'alternate' ? 'ALTERNATE-GRID' : 'HEADER-REDISCOVERY'
  const seed = group === 'starvation' ? 0x73ba5 : group === 'alternate' ? 0x59d14e27 : 0xc71a5e93
  let state = (seed + index * 0x9e3779b9) >>> 0
  let text = `${prefix}-HOLDOUT-${index}-`
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
      let x = (px + (dx + 0.5) / 2) / scale - 6
      let y = (py + (dy + 0.5) / 2) / scale - 6
      if (index === 16) [x, y] = [y, x]
      const u = (x - 3.5) / (qr.size - 7)
      const h = -3 * 4 * u * (1 - u)
      y = (y - h) / (1 - h / qr.size)
      if (index === 16) [x, y] = [y, x]
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
  for (let r = 0; r < index % 4; r++) {
    const next = new Uint8Array(data.length)
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) next[x * side + side - 1 - y] = data[y * side + x]!
    data = next
  }
  if (inverted) data = Uint8Array.from(data, value => 255 - value)
  return { image: { data, width: side, height: side }, text, version, ecc, mirrored, inverted }
}
