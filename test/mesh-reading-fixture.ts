import { encode } from '../src/encode.js'

/** Curved symbols whose mesh reads before timing corrections displace it. */
export function meshReadingPicture(index: 16 | 87) {
  const version = index === 16 ? 10 : 38
  const scale = index === 16 ? 5 : 3
  const amplitude = index === 16 ? 3 : 7
  const sign = index === 16 ? -1 : 1
  const inverted = index === 87
  let state = (0x51ee7 + index * 0x9e3779b9) >>> 0
  let text = `FRESH-BOUNDARY-${index}-`
  for (let k = 0; k < Math.floor(version * version * 0.4); k++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    text += '0123456789abcdefghijklmnopqrstuvwxyz'[state % 36]!
  }
  const qr = encode(text, { version, ecc: index === 16 ? 'M' : 'Q' })
  const side = (qr.size + 12) * scale
  let data = new Uint8Array(side * side)
  for (let py = 0; py < side; py++) for (let px = 0; px < side; px++) {
    let sum = 0
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      let x = (px + (sx + 0.5) / 2) / scale - 6
      let y = (py + (sy + 0.5) / 2) / scale - 6
      if (index === 16) [x, y] = [y, x]
      const u = (x - 3.5) / (qr.size - 7)
      const shape = index === 16 ? 4 * u * (1 - u) : Math.sin(2 * Math.PI * u)
      const h = sign * amplitude * shape
      y = (y - h) / (1 - h / qr.size)
      if (index === 16) [x, y] = [y, x]
      const mx = Math.floor(x), my = Math.floor(y)
      sum += mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my * qr.size + mx] ? 25 : 230
    }
    data[py * side + px] = Math.floor(sum / 4)
  }
  for (let r = 0; r < (index === 16 ? 0 : 3); r++) {
    const next = new Uint8Array(data.length)
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) next[x * side + side - 1 - y] = data[y * side + x]!
    data = next
  }
  if (inverted) data = Uint8Array.from(data, (v) => 255 - v)
  return { image: { data, width: side, height: side }, text, version, inverted }
}
