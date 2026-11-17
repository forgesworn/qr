// Synthetic geometry, frozen before candidate evaluation; not camera images.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'

export function framesFor(rivals) {
  const external = createRequire(rivals + '/package.json')
  assert.equal(external('qrcode/package.json').version, '1.5.4')
  const qr = external('qrcode'), hash = data => createHash('sha256').update(data).digest('hex')
  const frames = []
  for (const version of [8, 10, 11, 12]) for (const scale of [2, 3])
    for (const amplitude of [2, 5]) for (const sign of [-1, 1])
      for (const axis of ['x', 'y']) for (const profile of ['parabola', 'double-wave', 'circular-arch', 'cubic-skew']) {
        const index = frames.length
        const ecc = ['L', 'M', 'Q', 'H'][(index + Math.floor(index / 4) + Math.floor(index / 16)) % 4]
        let state = (0x3b19e72d + Math.imul(index, 0x9e3779b9)) >>> 0
        let text = `SMALL-PARABOLA-VALIDATION-${index}-`
        for (let k = 0; k < 24; k++) {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0
          text += '0123456789abcdefghijklmnopqrstuvwxyz'[state % 36]
        }
        const q = qr.create(text, {version, errorCorrectionLevel: ecc}), size = q.modules.size
        const side = (size + 12) * scale, data = new Uint8Array(side * side)
        for (let py = 0; py < side; py++) for (let px = 0; px < side; px++) {
          let sum = 0
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            let x = (px + (dx + 0.5) / 2) / scale - 6, y = (py + (dy + 0.5) / 2) / scale - 6
            if (axis === 'x') [x, y] = [y, x]
            const u = (x - 3.5) / (size - 7)
            let shape = 0
            if (u >= 0 && u <= 1) {
              if (profile === 'parabola') shape = 4 * u * (1 - u)
              else if (profile === 'double-wave') shape = Math.sin(2 * Math.PI * u)
              else if (profile === 'circular-arch') shape = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2))
              else shape = 4 * u * (1 - u) * (2 * u - 1)
            }
            const h = sign * amplitude * shape
            // For fixed x, the forward mapping is h + y * (1 - h / size).
            // |h| <= 5 and size >= 49 make the denominator strictly positive.
            y = (y - h) / (1 - h / size)
            if (axis === 'x') [x, y] = [y, x]
            const ix = Math.floor(x), iy = Math.floor(y)
            sum += ix >= 0 && iy >= 0 && ix < size && iy < size && q.modules.data[iy * size + ix] ? 25 : 230
          }
          data[py * side + px] = Math.floor(sum / 4)
        }
        let pixels = data
        const rotation = Math.floor(index / 4) % 4, inverted = Math.floor(index / 16) % 2 === 1, mirrored = Math.floor(index / 32) % 2 === 1
        if (mirrored) {
          const next = new Uint8Array(pixels.length)
          for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) next[y * side + side - 1 - x] = pixels[y * side + x]
          pixels = next
        }
        for (let r = 0; r < rotation; r++) {
          const next = new Uint8Array(pixels.length)
          for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) next[x * side + side - 1 - y] = pixels[y * side + x]
          pixels = next
        }
        if (inverted) pixels = Uint8Array.from(pixels, v => 255 - v)
        frames.push({meta: {id: `small-parabola-validation-${index}`, version, scale, amplitude, sign, axis, profile,
          ecc, rotation, inverted, mirrored, pixelSha256: hash(pixels), textSha256: hash(text)},
          text, image: {data: pixels, width: side, height: side}})
      }
  assert.equal(frames.length, 256)
  return frames
}
