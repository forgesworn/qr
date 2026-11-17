// Synthetic photographs whose dark modules are thinned (erosion) or thickened
// (dilation) by a square of half-side `spread` modules, as over-exposure, screen
// bloom or ink spread do. Diagnostic generator; imports no decoder.
export function prng(seed) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32 }
}
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
/** shot: scale (pixels a module), angle (degrees), perspective, spread (+ thickens, - thins), blur, noise, seed, invert, margin. */
export function render(modules, size, shot) {
  const margin = shot.margin ?? 4, side = size + 2 * margin, half = side * shot.scale / 2
  const angle = (shot.angle ?? 0) * Math.PI / 180, narrow = 1 - (shot.perspective ?? 0)
  const reach = Math.ceil(half * Math.SQRT2) + 4, width = 2 * reach, height = 2 * reach
  const turn = (x, y) => ({ x: reach + x * Math.cos(angle) - y * Math.sin(angle), y: reach + x * Math.sin(angle) + y * Math.cos(angle) })
  const inverse = homography([turn(-half * narrow, -half), turn(half * narrow, -half), turn(half, half), turn(-half, half)])
  const module = (mx, my) => mx >= 0 && my >= 0 && mx < size && my < size && modules[my * size + mx] === 1
  const spread = shot.spread ?? 0, e = Math.abs(spread)
  const dark = (fx, fy) => {
    // fx, fy in module units from the symbol's top-left corner.
    const xs = [Math.floor(fx - e), Math.floor(fx + e)], ys = [Math.floor(fy - e), Math.floor(fy + e)]
    let all = true, any = false
    for (const y of ys) for (const x of xs) { const v = module(x, y); all &&= v; any ||= v }
    return spread >= 0 ? any : all
  }
  const light = shot.invert ? 30 : 225, ink = shot.invert ? 225 : 30
  const random = prng(shot.seed ?? 1)
  let data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const p = inverse(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)
      const inside = p.x >= 0 && p.x < 1 && p.y >= 0 && p.y < 1
      sum += inside && dark(p.x * side - margin, p.y * side - margin) ? ink : inside ? light : shot.invert ? light : 200
    }
    data[y * width + x] = sum / 9
  }
  if (shot.blur) {
    const r = shot.blur, out = new Uint8Array(data.length)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let s = 0, n = 0
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
        s += data[yy * width + xx]; n++
      }
      out[y * width + x] = s / n
    }
    data = out
  }
  for (let i = 0; i < data.length; i++) {
    const noise = shot.noise ? (random() * 2 - 1) * shot.noise : 0
    data[i] = Math.max(0, Math.min(255, Math.round(data[i] + noise)))
  }
  return { data, width, height }
}
