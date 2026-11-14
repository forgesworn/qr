// Minimal 8-bit greyscale PNG writer and reader for the decode fixtures.
// Test-only; the package does not read or write images.
import { deflateSync, inflateSync } from 'node:zlib'
import type { Grey } from './photo.js'

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

export function writePng(image: Grey): Uint8Array {
  const { data, width, height } = image
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 0, 0, 0, 0], 8) // 8 bits, greyscale, deflate, no filter method, no interlace
  const raw = new Uint8Array((width + 1) * height)
  for (let y = 0; y < height; y++) {
    // Filter 1 (sub) shrinks smooth areas; the reader undoes all five filters.
    raw[y * (width + 1)] = 1
    for (let x = 0; x < width; x++) {
      const v = data[y * width + x]!
      const left = x > 0 ? data[y * width + x - 1]! : 0
      raw[y * (width + 1) + 1 + x] = (v - left) & 0xff
    }
  }
  const parts = [Uint8Array.from(SIGNATURE), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export function readPng(file: Uint8Array): Grey {
  for (let i = 0; i < 8; i++) if (file[i] !== SIGNATURE[i]) throw new Error('Not a PNG')
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  let width = 0
  let height = 0
  const idat: Uint8Array[] = []
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
    const filter = raw[y * (width + 1)]!
    for (let x = 0; x < width; x++) {
      const v = raw[y * (width + 1) + 1 + x]!
      const a = x > 0 ? data[y * width + x - 1]! : 0
      const b = y > 0 ? data[(y - 1) * width + x]! : 0
      const c = x > 0 && y > 0 ? data[(y - 1) * width + x - 1]! : 0
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
