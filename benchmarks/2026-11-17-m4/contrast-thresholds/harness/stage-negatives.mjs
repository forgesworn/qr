// Frames built to reach the terminal contrast-threshold search: faint
// content on flat paper. Five kinds hold no symbol and must never read; the
// sixth holds a real symbol damaged past repair, whose only acceptable
// outcomes are a miss or its own text. Deterministic; diagnostic.
export const SEED = 0x3d1e7a55
function lcg(seed) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}
const KINDS = ['noise-patches', 'fake-symbol', 'finders', 'text-rows', 'mask-texture', 'damaged-real']

function finderInto(modules, size, ox, oy) {
  for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
    const px = ox + x, py = oy + y
    if (px < 0 || py < 0 || px >= size || py >= size) continue
    const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3))
    modules[py * size + px] = ring === 2 || ring === 4 ? 0 : 1
  }
}

/** Area-sampled affine rendering of a module grid onto `data`, faint by `contrast`. */
function draw(data, width, height, grid, place, paper, contrast, invert, random) {
  const { scale, angle, shear, cx, cy } = place
  const c = Math.cos(angle), s = Math.sin(angle), half = grid.size / 2
  const reach = grid.size * scale * 0.8
  for (let y = Math.max(0, Math.floor(cy - reach)); y < Math.min(height, Math.ceil(cy + reach)); y++) {
    for (let x = Math.max(0, Math.floor(cx - reach)); x < Math.min(width, Math.ceil(cx + reach)); x++) {
      let dark = 0, inside = 0
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        const fx = x + (sx + 0.5) / 3 - cx, fy = y + (sy + 0.5) / 3 - cy
        const rx = fx * c + fy * s, ry = -fx * s + fy * c
        const mx = Math.floor((rx + ry * shear) / scale + half), my = Math.floor(ry / scale + half)
        if (mx >= 0 && my >= 0 && mx < grid.size && my < grid.size) { inside++; if (grid.modules[my * grid.size + mx]) dark++ }
      }
      if (!inside) continue
      const level = invert ? paper - contrast + contrast * dark / 9 : paper - contrast * dark / 9
      data[y * width + x] = Math.max(0, Math.min(255, Math.round(level + (random() - 0.5) * 2)))
    }
  }
}

/** encode(text, ecc) -> { size, modules } for the damaged real symbols. */
export function stageFrames(encode, count = 3000) {
  const random = lcg(SEED)
  const frames = []
  for (let i = 0; i < count; i++) {
    const kind = KINDS[i % KINDS.length]
    const [width, height] = i % 2 ? [480, 360] : [320, 240]
    const paper = 90 + random() * 140, grain = random() * 6
    const contrast = 25 + random() * 45
    const invert = random() < 0.2
    const data = new Uint8Array(width * height)
    for (let p = 0; p < data.length; p++) data[p] = Math.max(0, Math.min(255, Math.round(paper + (random() - 0.5) * grain)))
    const place = (size, lo, hi) => {
      const scale = lo + random() * (hi - lo), reach = size * scale * 0.75
      return { scale, angle: random() * Math.PI * 2, shear: (random() - 0.5) * 0.5,
        cx: reach + random() * Math.max(1, width - 2 * reach), cy: reach + random() * Math.max(1, height - 2 * reach) }
    }
    let text = null
    if (kind === 'noise-patches') {
      for (let k = 0, n = 1 + Math.floor(random() * 4); k < n; k++) {
        const w = 16 + Math.floor(random() * 120), h = 16 + Math.floor(random() * 90)
        const x0 = Math.floor(random() * (width - w)), y0 = Math.floor(random() * (height - h))
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data[y * width + x] = Math.max(0, Math.min(255, Math.round(paper - contrast * random())))
      }
    } else if (kind === 'fake-symbol' || kind === 'finders' || kind === 'mask-texture' || kind === 'text-rows') {
      const size = kind === 'fake-symbol' ? 21 + 4 * Math.floor(random() * 6) : kind === 'text-rows' ? 70 : 41
      const modules = new Uint8Array(size * size)
      if (kind === 'fake-symbol') {
        for (let m = 0; m < modules.length; m++) modules[m] = random() < 0.5 ? 1 : 0
        finderInto(modules, size, 0, 0); finderInto(modules, size, size - 7, 0); finderInto(modules, size, 0, size - 7)
        for (let t = 8; t < size - 8; t++) modules[6 * size + t] = modules[t * size + 6] = t % 2 === 0 ? 1 : 0
      } else if (kind === 'finders') {
        for (let f = 0, n = 1 + Math.floor(random() * 3); f < n; f++) finderInto(modules, size, 1 + Math.floor(random() * (size - 9)), 1 + Math.floor(random() * (size - 9)))
        for (let b = 0; b < 30; b++) { const bx = Math.floor(random() * size), by = Math.floor(random() * size); modules[by * size + bx] = 1 }
      } else if (kind === 'mask-texture') {
        // The textures the mask patterns make: stripes and checkerboards.
        const pattern = Math.floor(random() * 4)
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) modules[y * size + x] = [(x + y) % 2, y % 2, x % 3 === 0 ? 1 : 0, (Math.floor(y / 2) + Math.floor(x / 3)) % 2][pattern] === 0 ? 1 : 0
      } else {
        for (let row = 2; row < size - 4; row += 5) for (let x = 2; x < size - 2; x++) if (random() < 0.55) for (let y = row; y < row + 3; y++) modules[y * size + x] = random() < 0.8 ? 1 : 0
      }
      draw(data, width, height, { size, modules }, place(size, kind === 'text-rows' ? 1.2 : 1.8, kind === 'text-rows' ? 2.2 : 3.5), paper, contrast, invert, random)
    } else {
      // A real symbol with a third of its non-finder modules flipped: beyond any level's correction.
      text = `https://example.org/stage/${i}/` + 'abcdefghij'.slice(0, 1 + (i % 10))
      const grid = encode(text, 'LMQH'[i % 4])
      const modules = Uint8Array.from(grid.modules)
      for (let y = 0; y < grid.size; y++) for (let x = 0; x < grid.size; x++) {
        const finder = (x < 8 && y < 8) || (x >= grid.size - 8 && y < 8) || (x < 8 && y >= grid.size - 8)
        if (!finder && random() < 0.33) modules[y * grid.size + x] ^= 1
      }
      draw(data, width, height, { size: grid.size, modules }, place(grid.size, 1.8, 3.5), paper, contrast, invert, random)
    }
    frames.push({ name: `stage-${kind}-${String(i).padStart(4, '0')}`, kind, text, data, width, height })
  }
  return frames
}
