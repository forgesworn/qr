import { encode } from '../src/encode.js'

/** A synthetic sheet whose curvature continues past the alignment lattice. */
export function meshBoundaryPicture(scale: 2 | 3) {
  const text = `SHEET-34-${scale}-10-` + '0123456789abcdefghijklmnopqrstuvwxyz'.repeat(68).slice(0, 1300)
  const qr = encode(text, { version: 34, ecc: 'M' })
  const side = (qr.size + 8) * scale
  const data = new Uint8Array(side * side)
  for (let py = 0; py < side; py++) for (let px = 0; px < side; px++) {
    let sum = 0
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      const x = (px + (sx + 0.5) / 2) / scale - 4
      const y = (py + (sy + 0.5) / 2) / scale - 4
      const h = 10 * Math.sin(Math.PI * (x - 3.5) / (qr.size - 7))
      const sourceY = (y - h) / (1 - h / qr.size)
      const mx = Math.floor(x), my = Math.floor(sourceY)
      sum += mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my * qr.size + mx] ? 30 : 225
    }
    data[py * side + px] = Math.floor(sum / 4)
  }
  return { image: { data, width: side, height: side }, text }
}
