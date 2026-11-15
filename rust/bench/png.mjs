// Reads an 8-bit greyscale, non-interlaced PNG with node:zlib: a port of the
// reader in test/png.ts, for the scripts that read the conformance pack.

import { inflateSync } from 'node:zlib'

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

export function readPng(file) {
  for (let i = 0; i < 8; i++) if (file[i] !== SIGNATURE[i]) throw new Error('Not a PNG')
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  let width = 0
  let height = 0
  const idat = []
  for (let at = 8; at < file.length; ) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...file.subarray(at + 4, at + 8))
    const body = file.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      if (body[8] !== 8 || body[9] !== 0 || body[12] !== 0) throw new Error('Only 8-bit greyscale, non-interlaced PNGs')
    } else if (type === 'IDAT') {
      idat.push(body)
    }
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width + 1)]
    for (let x = 0; x < width; x++) {
      const v = raw[y * (width + 1) + 1 + x]
      const a = x > 0 ? data[y * width + x - 1] : 0
      const b = y > 0 ? data[(y - 1) * width + x] : 0
      const c = x > 0 && y > 0 ? data[(y - 1) * width + x - 1] : 0
      let predicted = 0
      if (filter === 1) predicted = a
      else if (filter === 2) predicted = b
      else if (filter === 3) predicted = (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      data[y * width + x] = (v + predicted) & 0xff
    }
  }
  return { data, width, height }
}
