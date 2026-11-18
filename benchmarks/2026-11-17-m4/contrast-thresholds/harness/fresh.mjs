// Fresh development frames for the flat-background threshold investigation.
// Written and hashed before any decoder saw them. Pure JS, deterministic.
// Positives: small, often blurred, often low-contrast codes on flat
// backgrounds, area-sampled so edges are anti-aliased. Negatives: the same
// backgrounds with decoys, including fake symbols that carry three real
// finder patterns, timing patterns and random modules.
export const SEED = 0x2c7e91d3

function lcg(seed) {
  let state = seed >>> 0
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}

/** A symbol-like grid with real finders and timing patterns around random modules. */
function fakeSymbol(size, random) {
  const modules = new Uint8Array(size * size)
  for (let i = 0; i < modules.length; i++) modules[i] = random() < 0.5 ? 1 : 0
  const finder = (ox, oy) => {
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
      const px = ox + x, py = oy + y
      if (px < 0 || py < 0 || px >= size || py >= size) continue
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3))
      modules[py * size + px] = ring === 2 || ring === 4 ? 0 : 1
    }
  }
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7)
  for (let i = 8; i < size - 8; i++) modules[6 * size + i] = modules[i * size + 6] = i % 2 === 0 ? 1 : 0
  return { size, modules }
}

/** Renders a module grid by 3x3 area sampling through an affine map. */
function render(grid, frame, place, random) {
  const { width, height, paper, ink, gradient, grain, blur } = frame
  const { scale, aspect, angle, shear, cx, cy } = place
  const c = Math.cos(angle), s = Math.sin(angle)
  const data = new Uint8Array(width * height)
  const half = grid.size / 2
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let dark = 0
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const fx = x + (sx + 0.5) / 3 - cx, fy = y + (sy + 0.5) / 3 - cy
      const rx = fx * c + fy * s, ry = -fx * s + fy * c
      const mx = Math.floor((rx + ry * shear) / scale + half), my = Math.floor(ry / (scale * aspect) + half)
      if (mx >= 0 && my >= 0 && mx < grid.size && my < grid.size && grid.modules[my * grid.size + mx]) dark++
    }
    const base = paper + gradient * (x / width - 0.5)
    const level = base + (ink - paper) * dark / 9 + (random() - 0.5) * grain
    data[y * width + x] = Math.max(0, Math.min(255, Math.round(level)))
  }
  for (let pass = 0; pass < blur; pass++) {
    const copy = data.slice()
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      data[p] = Math.round((copy[p] * 4 + copy[p - 1] + copy[p + 1] + copy[p - width] + copy[p + width]) / 8)
    }
  }
  return data
}

const SIZES = [[480, 360], [640, 480], [800, 600]]

function frameParams(i, random) {
  const [width, height] = SIZES[i % 3]
  const paper = 90 + random() * 140
  const contrast = 35 + random() * 105
  const inverted = i % 6 === 5
  return {
    width, height,
    paper: inverted ? Math.max(0, paper - contrast) : paper,
    ink: inverted ? paper : Math.max(0, paper - contrast),
    contrast,
    gradient: (random() - 0.5) * 40,
    grain: 1 + random() * 7,
    blur: i % 3 === 0 ? 0 : 1 + (random() < 0.3 ? 1 : 0),
    inverted,
  }
}

function placement(frame, size, random, minScale = 1.8, maxScale = 4) {
  const scale = minScale + random() * (maxScale - minScale)
  const aspect = 0.85 + random() * 0.3
  const angle = random() * Math.PI * 2
  const shear = (random() - 0.5) * 0.6
  const reach = size * scale * 0.85
  const cx = reach + random() * Math.max(1, frame.width - 2 * reach)
  const cy = reach + random() * Math.max(1, frame.height - 2 * reach)
  return { scale, aspect, angle, shear, cx, cy }
}

/** encode(text, ecc) -> { size, modules }. Returns positives then negatives. */
export function freshFrames(encode, { positives = 480, negatives = 96 } = {}) {
  const random = lcg(SEED)
  const frames = []
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < positives; i++) {
    const ecc = 'LMQH'[i % 4]
    let tail = ''
    for (let k = 0, n = 6 + Math.floor(random() * 60); k < n; k++) tail += alphabet[Math.floor(random() * alphabet.length)]
    const text = `https://example.org/fresh/${i}/${tail}`
    const grid = encode(text, ecc)
    const frame = frameParams(i, random)
    const place = placement(frame, grid.size, random)
    frames.push({ name: `fresh-${String(i).padStart(3, '0')}`, text, ecc, version: (grid.size - 17) / 4, frame, place, data: render(grid, frame, place, random), width: frame.width, height: frame.height })
  }
  for (let i = 0; i < negatives; i++) {
    const frame = frameParams(i, random)
    const kind = ['fake', 'finders', 'clutter'][i % 3]
    let data
    if (kind === 'fake') {
      const grid = fakeSymbol(21 + 4 * Math.floor(random() * 8), random)
      data = render(grid, frame, placement(frame, grid.size, random), random)
    } else if (kind === 'finders') {
      // Two or three finder patterns, not arranged as one symbol, plus random blocks.
      const size = 61, grid = { size, modules: new Uint8Array(size * size) }
      const count = 2 + Math.floor(random() * 2)
      for (let f = 0; f < count; f++) {
        const ox = Math.floor(random() * (size - 7)), oy = Math.floor(random() * (size - 7))
        for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
          const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3))
          grid.modules[(oy + y) * size + ox + x] = ring === 2 ? 0 : 1
        }
      }
      for (let b = 0; b < 40; b++) {
        const bx = Math.floor(random() * size), by = Math.floor(random() * size), bw = 1 + Math.floor(random() * 4), bh = 1 + Math.floor(random() * 4)
        for (let y = by; y < Math.min(size, by + bh); y++) for (let x = bx; x < Math.min(size, bx + bw); x++) grid.modules[y * size + x] = 1
      }
      data = render(grid, frame, placement(frame, size, random, 1.5, 3), random)
    } else {
      // Text-like rows of small glyph blocks over a flat background.
      const size = 90, grid = { size, modules: new Uint8Array(size * size) }
      for (let row = 2; row < size - 4; row += 5) for (let x = 2; x < size - 2; x++) {
        if (random() < 0.55) for (let y = row; y < row + 3; y++) grid.modules[y * size + x] = random() < 0.8 ? 1 : 0
      }
      data = render(grid, frame, placement(frame, size, random, 1.2, 2.2), random)
    }
    frames.push({ name: `fresh-negative-${kind}-${String(i).padStart(2, '0')}`, text: null, frame, data, width: frame.width, height: frame.height })
  }
  return frames
}
