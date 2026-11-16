// Fixed before comparative evaluation. Pure JS so Node and browsers use identical pixels.
export function timingFrames(encode) {
  const width = 1280, height = 720, text = 'https://example.com/performance/0123456789'
  const qr = encode(text), clean = new Uint8Array(width * height).fill(230)
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y * qr.size + x]) {
    for (let dy = 0; dy < 9; dy++) clean.fill(25, (150 + y * 9 + dy) * width + 400 + x * 9, (150 + y * 9 + dy) * width + 409 + x * 9)
  }
  let seed = 5
  const noise = Uint8Array.from({ length: width * height }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed >>> 24
  })
  return [['clean', clean, text], ['blank', new Uint8Array(width * height).fill(200), undefined], ['noise', noise, undefined]].map(([name, grey, expected]) => ({ name, expected, ...rgba({ data: grey, width, height }) }))
}
export function rgba(image) {
  const data = new Uint8ClampedArray(image.width * image.height * 4)
  for (let i = 0; i < image.data.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = image.data[i]; data[i * 4 + 3] = 255
  }
  return { data, width: image.width, height: image.height }
}
export function heldOutFrames(encode, { seed = 0x783fa126, count = 96, prefix = 'held-out' } = {}) {
  let state = seed
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32)
  const frames = []
  for (let i = 0; i < count; i++) {
    const expected = `https://example.com/${prefix}/${i}/` + '0123456789ABCDEF'.repeat(1 + i % 6)
    const qr = encode(expected, i % 2 ? 'H' : 'M')
    const width = 480, height = 360, data = new Uint8Array(width * height)
    const scale = [2, 3, 4, 5][i % 4], angle = (random() - 0.5) * Math.PI * 2
    const c = Math.cos(angle), s = Math.sin(angle), shear = (random() - 0.5) * 0.7
    const contrast = 70 + random() * 130, centreX = 210 + random() * 60, centreY = 160 + random() * 40
    const inverted = i % 5 === 0, grain = i % 3 === 0 ? 35 : 8
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const rx = (x - centreX) * c + (y - centreY) * s, ry = -(x - centreX) * s + (y - centreY) * c
      const px = Math.floor((rx + ry * shear) / scale + qr.size / 2), py = Math.floor(ry / scale + qr.size / 2)
      const dark = px >= 0 && py >= 0 && px < qr.size && py < qr.size && qr.modules[py * qr.size + px]
      const level = 125 + ((!!dark !== inverted) ? -contrast / 2 : contrast / 2) + 25 * x / width + (random() - 0.5) * grain
      data[y * width + x] = Math.max(0, Math.min(255, Math.round(level)))
    }
    if (i % 4 === 0) {
      const copy = data.slice()
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const p = y * width + x
        data[p] = Math.round((copy[p] * 4 + copy[p - 1] + copy[p + 1] + copy[p - width] + copy[p + width]) / 8)
      }
    }
    frames.push({ name: `${prefix}-${i}`, expected, ...rgba({ data, width, height }) })
  }
  return frames
}
// Frozen before evaluating the next candidate. New pixels and payloads from
// the same synthetic transformation family; this is not a camera-photo corpus.
export function validationFrames(encode) {
  return heldOutFrames(encode, { seed: 0x6d3a217b, count: 192, prefix: 'validation' })
}
export function summary(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] }
}
