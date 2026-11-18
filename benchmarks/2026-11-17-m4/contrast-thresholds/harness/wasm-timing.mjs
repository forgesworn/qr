// Paired timings of two packaged WASM modules (same ABI) on the codeless mixed
// frames of timing.mjs. Complete results are compared outside the timed calls.
// node wasm-timing.mjs <dist> <before.wasm> <after.wasm> <out.json> [pairs]
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const [dist, beforePath, afterPath, out, pairsArg] = process.argv.slice(2)
const pairs = Number(pairsArg ?? 40)
const { loadWasm } = await import(pathToFileURL(resolve(dist) + '/wasm.js'))
const before = await loadWasm(readFileSync(beforePath)), after = await loadWasm(readFileSync(afterPath))
const width = 1280, height = 720
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) }
function rgba(grey) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < grey.length; i++) { data[4 * i] = data[4 * i + 1] = data[4 * i + 2] = grey[i]; data[4 * i + 3] = 255 }
  return { data, width, height }
}
// The same four frames as timing.mjs, from the same seeds.
const { encode } = await import(pathToFileURL(resolve(dist) + '/index.js'))
const r = lcg(11), frames = []
let g = new Uint8Array(width * height)
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) g[y * width + x] = x < width / 2 ? 196 + Math.floor(r() * 4) : Math.floor(40 + r() * 180)
frames.push(['half-texture', g])
g = new Uint8Array(width * height).fill(222)
for (let row = 80; row < height - 80; row += 22) for (let x = 120; x < width - 120; x += 7) {
  if (r() < 0.6) { const h = 9 + Math.floor(r() * 5), w = 3 + Math.floor(r() * 4); for (let y = row; y < row + h; y++) for (let dx = 0; dx < w; dx++) g[y * width + x + dx] = 40 + Math.floor(r() * 30) }
}
frames.push(['text-page', g])
g = new Uint8Array(width * height)
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) g[y * width + x] = 150 + Math.round(30 * x / width)
for (let k = 0; k < 14; k++) {
  const x0 = Math.floor(r() * (width - 200)), y0 = Math.floor(r() * (height - 150)), w = 40 + Math.floor(r() * 160), h = 30 + Math.floor(r() * 120), level = Math.floor(r() * 255)
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y * width + x] = Math.max(0, Math.min(255, level + Math.floor((r() - 0.5) * 40)))
}
frames.push(['objects', g])
g = new Uint8Array(width * height).fill(205)
const qr = encode('https://example.com/timing/damaged/0123456789', 'L')
for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
  const dark = qr.modules[y * qr.size + x] && !(x > 10 && x < 22 && y > 8 && y < 26)
  if (dark) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) g[(300 + y * 3 + dy) * width + 600 + x * 3 + dx] = 90
}
frames.push(['damaged-code', g])
const canon = v => JSON.stringify(v ?? null, (k, x) => x instanceof Uint8Array ? Buffer.from(x).toString('hex') : x)
const median = v => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const results = []
for (const [name, grey] of frames) {
  const image = rgba(grey)
  assert.equal(canon(after.decode(image)), canon(before.decode(image)), `${name}: results differ`)
  for (let i = 0; i < 8; i++) { before.decode(image); after.decode(image) }
  const t = { before: [], after: [] }
  for (let i = 0; i < pairs; i++) {
    for (const [n, m] of i % 2 ? [['after', after], ['before', before]] : [['before', before], ['after', after]]) { const s = performance.now(); m.decode(image); t[n].push(performance.now() - s) }
  }
  const row = { name, beforeMedianMs: +median(t.before).toFixed(3), afterMedianMs: +median(t.after).toFixed(3), changePct: +(100 * (median(t.after) / median(t.before) - 1)).toFixed(2) }
  results.push(row)
  console.log(JSON.stringify(row))
}
before.dispose(); after.dispose()
writeFileSync(out, JSON.stringify({ pairs, node: process.version, results }, null, 1))
