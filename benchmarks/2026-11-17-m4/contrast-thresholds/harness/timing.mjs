// Paired timings of two builds on codeless 1280x720 frames that mix flat and
// textured areas, where the terminal contrast-threshold stage runs, plus the
// fixed clean, blank and noise frames. Complete results are compared outside
// the timed calls. node timing.mjs <baseDist> <candDist> <out.json> [pairs]
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { timingFrames } from '../../../../scripts/comparison-fixtures.mjs'
const [baseDist, candDist, out, pairsArg] = process.argv.slice(2)
const pairs = Number(pairsArg ?? 40)
const load = d => import(pathToFileURL(resolve(d) + '/decode.js'))
const base = (await load(baseDist)).decodeCounted, cand = (await load(candDist)).decodeCounted
const { encode } = await import(pathToFileURL(resolve(baseDist) + '/index.js'))
const width = 1280, height = 720
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) }
function rgba(grey) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < grey.length; i++) { data[4 * i] = data[4 * i + 1] = data[4 * i + 2] = grey[i]; data[4 * i + 3] = 255 }
  return { data, width, height }
}
function mixed() {
  const r = lcg(11), frames = []
  // Half flat wall, half fine texture.
  let g = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) g[y * width + x] = x < width / 2 ? 196 + Math.floor(r() * 4) : Math.floor(40 + r() * 180)
  frames.push(['half-texture', g])
  // A page of text-like rows on flat paper.
  g = new Uint8Array(width * height).fill(222)
  for (let row = 80; row < height - 80; row += 22) for (let x = 120; x < width - 120; x += 7) {
    if (r() < 0.6) { const h = 9 + Math.floor(r() * 5), w = 3 + Math.floor(r() * 4); for (let y = row; y < row + h; y++) for (let dx = 0; dx < w; dx++) g[y * width + x + dx] = 40 + Math.floor(r() * 30) }
  }
  frames.push(['text-page', g])
  // Flat background with scattered objects: rectangles with edges and shading.
  g = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) g[y * width + x] = 150 + Math.round(30 * x / width)
  for (let k = 0; k < 14; k++) {
    const x0 = Math.floor(r() * (width - 200)), y0 = Math.floor(r() * (height - 150)), w = 40 + Math.floor(r() * 160), h = 30 + Math.floor(r() * 120), level = Math.floor(r() * 255)
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y * width + x] = Math.max(0, Math.min(255, level + Math.floor((r() - 0.5) * 40)))
  }
  frames.push(['objects', g])
  // A small damaged code on flat paper: a persistent miss.
  g = new Uint8Array(width * height).fill(205)
  const qr = encode('https://example.com/timing/damaged/0123456789', 'L')
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
    const dark = qr.modules[y * qr.size + x] && !(x > 10 && x < 22 && y > 8 && y < 26)
    if (dark) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) g[(300 + y * 3 + dy) * width + 600 + x * 3 + dx] = 90
  }
  frames.push(['damaged-code', g])
  return frames.map(([name, grey]) => ({ name, expected: undefined, ...rgba(grey) }))
}
const frames = [...timingFrames(encode), ...mixed()]
const canon = r => JSON.stringify(r ?? null, (k, v) => v instanceof Uint8Array ? Buffer.from(v).toString('hex') : v)
const results = []
for (const f of frames) {
  const a = base(f), b = cand(f)
  assert.equal(canon(b), canon(a), `${f.name}: results differ`)
  const times = { base: [], cand: [] }
  for (let i = 0; i < 8; i++) { base(f); cand(f) }
  for (let i = 0; i < pairs; i++) {
    const first = i % 2 === 0 ? ['base', base] : ['cand', cand], second = i % 2 === 0 ? ['cand', cand] : ['base', base]
    for (const [n, d] of [first, second]) { const t = performance.now(); d(f); times[n].push(performance.now() - t) }
  }
  const median = v => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
  const p95 = v => { const s = [...v].sort((x, y) => x - y); return s[Math.ceil(s.length * 0.95) - 1] }
  const row = { name: f.name, read: a !== undefined, baseMedianMs: +median(times.base).toFixed(3), candMedianMs: +median(times.cand).toFixed(3), changePct: +(100 * (median(times.cand) / median(times.base) - 1)).toFixed(2), baseP95Ms: +p95(times.base).toFixed(3), candP95Ms: +p95(times.cand).toFixed(3) }
  results.push(row)
  console.log(JSON.stringify(row))
}
writeFileSync(out, JSON.stringify({ pairs, node: process.version, results }, null, 1))
