// Development frames for the reduced-size pass: large or textured modules
// (dots, scan lines), spread ink and decoy finder patterns. Used to choose a
// policy, so never validation evidence. Imports no decoder.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { prng } from './render.mjs'
function homography([p0, p1, p2, p3]) {
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y
  const den = dx1 * dy2 - dx2 * dy1, g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y
  const A = e - f * h, B = c * h - b, C = b * f - c * e, D = f * g - d, E = a - c * g, F = c * d - a * f
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d
  return (x, y) => { const w = G * x + H * y + I; return { x: (A * x + B * y + C) / w, y: (D * x + E * y + F) / w } }
}
const FINDER = (x, y) => { const m = Math.max(Math.abs(x - 3), Math.abs(y - 3)); return m !== 2 && m <= 3 }
function inFinder(size, mx, my) {
  return (mx < 7 && my < 7) || (mx >= size - 7 && my < 7) || (mx < 7 && my >= size - 7)
}
export function framesFor(rivals, { seed = 0x9a7e5e1d, prefix = 'step9-dev' } = {}) {
  const ext = createRequire(rivals + '/package.json')
  assert.equal(ext('qrcode/package.json').version, '1.5.4')
  const qr = ext('qrcode'), random = prng(seed), frames = []
  const width = 1280, height = 720
  for (const style of ['dots', 'scanlines', 'grain', 'squares']) for (const spread of [-0.3, -0.2, 0, 0.2, 0.3]) for (const version of [1, 2, 4, 7, 10, 14]) {
    const index = frames.length, ecc = ['L', 'M', 'Q', 'H'][index % 4]
    let tail = ''
    for (let i = 0; i < 30 * version; i++) tail += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(random() * 36)]
    let text, q
    for (let n = 30 * version; ; n = Math.floor(n * 0.85)) {
      text = `${prefix.toUpperCase()}-${index}-` + tail.slice(0, n)
      try { q = qr.create(text, { version, errorCorrectionLevel: ecc }); break } catch { if (n === 0) throw Error('no fit') }
    }
    const size = q.modules.size, modules = q.modules.data
    // Large modules: the symbol spans most of the frame's height.
    const span = (0.55 + random() * 0.35) * height, scale = span / (size + 8)
    const angle = (random() - 0.5) * 0.6, narrow = 1 - random() * 0.2
    const cx = width / 2 + (random() - 0.5) * (width - span) * 0.6, cy = height / 2 + (random() - 0.5) * (height - span) * 0.3
    const half = (size + 8) * scale / 2
    const turn = (x, y) => ({ x: cx + x * Math.cos(angle) - y * Math.sin(angle), y: cy + x * Math.sin(angle) + y * Math.cos(angle) })
    const inverse = homography([turn(-half * narrow, -half), turn(half * narrow, -half), turn(half, half), turn(-half, half)])
    // Decoys: finder replicas beside the symbol, at a module size near the symbol's.
    const decoys = []
    for (let k = 0; k < 3; k++) decoys.push({ x: random() * (width - 60), y: random() * (height - 60), unit: scale * (0.7 + random() * 0.6) })
    const e = Math.abs(spread)
    const darkModule = (mx, my) => mx >= 0 && my >= 0 && mx < size && my < size && modules[my * size + mx] === 1
    const darkAt = (fx, fy) => {
      const mx = Math.floor(fx), my = Math.floor(fy)
      if (style === 'dots' && !inFinder(size, mx, my)) {
        if (!darkModule(mx, my)) return false
        const dx = fx - mx - 0.5, dy = fy - my - 0.5
        return Math.hypot(dx, dy) <= 0.42 + spread / 2
      }
      const xs = [Math.floor(fx - e), Math.floor(fx + e)], ys = [Math.floor(fy - e), Math.floor(fy + e)]
      let all = true, any = false
      for (const y of ys) for (const x of xs) { const v = darkModule(x, y); all &&= v; any ||= v }
      return spread >= 0 ? any : all
    }
    const noise = prng((seed + index * 0x9e3779b9) >>> 0)
    const data = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let sum = 0
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const px = x + (sx + 0.5) / 2, py = y + (sy + 0.5) / 2
        const p = inverse(px, py)
        let v = 200
        if (p.x >= 0 && p.x < 1 && p.y >= 0 && p.y < 1) v = darkAt(p.x * (size + 8) - 4, p.y * (size + 8) - 4) ? 35 : 220
        else for (const d of decoys) {
          const fx = (px - d.x) / d.unit, fy = (py - d.y) / d.unit
          if (fx >= 0 && fy >= 0 && fx < 7 && fy < 7) { v = FINDER(Math.floor(fx), Math.floor(fy)) ? 35 : 220; break }
        }
        sum += v
      }
      let g = sum / 4
      if (style === 'scanlines' && y % 3 === 0) g *= 0.55
      if (style === 'grain') g += (noise() * 2 - 1) * 45
      g += (noise() * 2 - 1) * 6
      data[y * width + x] = Math.max(0, Math.min(255, Math.round(g)))
    }
    frames.push({ meta: { id: `${prefix}-${index}`, style, spread, version, ecc, scale: +scale.toFixed(3) }, image: { data, width, height }, text })
  }
  return frames
}
