// Where the terminal stage spends its time on the mixed codeless timing frames. Diagnostic.
// node profile.mjs <candDist>
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const dist = resolve(process.argv[2])
const B = await import(pathToFileURL(dist + '/binarise.js'))
const L = await import(pathToFileURL(dist + '/locate.js'))
const { encode } = await import(pathToFileURL(dist + '/index.js'))
const width = 1280, height = 720
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) }
// Same frames as timing.mjs.
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
const time = (fn, n = 20) => { fn(); const t = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - t) / n }
for (const [name, data] of frames) {
  const lum = { data, width, height }
  const t0 = B.thresholds(lum), t1 = B.contrastThresholds(lum)
  let changed = 0
  for (let k = 0; k < t0.values.length; k++) if (t0.values[k] !== t1.values[k]) changed++
  const bits0 = B.binarise(lum, t0), bits1 = B.binarise(lum, t1)
  let differ = 0
  for (let i = 0; i < bits0.data.length; i++) if (bits0.data[i] !== bits1.data[i]) differ++
  const e1 = L.edgesOf(bits1), inv1 = B.invert(bits1)
  const finders = tol => L.findFinders(bits1, tol, undefined, e1)
  const out = {
    name, changedBlocks: `${changed}/${t0.values.length}`, differingPixels: differ,
    contrastThresholdsMs: time(() => B.contrastThresholds(lum)).toFixed(2),
    binariseMs: time(() => B.binarise(lum, t1)).toFixed(2),
    edgesMs: time(() => L.edgesOf(bits1)).toFixed(2),
    finders05: finders(0.5).length, finders08: finders(0.8).length,
    findersMs: time(() => { finders(0.5); finders(0.8); L.findFinders(inv1, 0.5, undefined, e1); L.findFinders(inv1, 0.8, undefined, e1) }).toFixed(2),
    triples: [0.5, 0.8].map(t => L.finderTriples(bits1, finders(t)).length).join('/'),
    sameFindersAsOriginal: JSON.stringify(L.findFinders(bits0, 0.8).map(f => [f.x, f.y])) === JSON.stringify(finders(0.8).map(f => [f.x, f.y])),
  }
  console.log(JSON.stringify(out))
}
