// Attributes noise-frame decode time to stages and size retries. Diagnostic only.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const dist = resolve(process.argv[2])
const iterations = Number(process.argv[3] ?? 30)
const { encode } = await import(pathToFileURL(dist + '/index.js'))
const { decodeCounted } = await import(pathToFileURL(dist + '/decode.js'))
const { timingFrames } = await import(pathToFileURL(resolve(process.argv[4]) + '/comparison-fixtures.mjs'))
const frames = timingFrames(encode)
const which = process.argv[5] ?? 'noise'
const frame = frames.find(f => f.name === which)
const stats = { stages: {}, locate: {}, read: {}, finders: {} }
let last = 0, on = false
const add = (table, key, ms, extra = {}) => {
  const r = table[key] ??= { ms: 0, n: 0 }
  r.ms += ms; r.n++
  for (const [k, v] of Object.entries(extra)) r[k] = (r[k] ?? 0) + v
}
globalThis.__t = {
  stage(name) { const now = performance.now(); if (on) add(stats.stages, name, now - last); last = now },
  locate(f, inv, tol, delta, ms, count) { if (on) add(stats.locate, `f${f} ${inv ? 'inv' : 'nrm'} t${tol} d${delta}`, ms, { maps: count }) },
  read(f, inv, tol, delta, ms, ok) { if (on) add(stats.read, `f${f} ${inv ? 'inv' : 'nrm'} t${tol} d${delta}`, ms) },
  finders(f, inv, tol, findMs, tripleMs, finders, triples) { if (on) add(stats.finders, `f${f} ${inv ? 'inv' : 'nrm'} t${tol}`, findMs + tripleMs, { finders, triples }) },
}
for (let i = 0; i < 10; i++) decodeCounted(frame, {})
const work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
decodeCounted(frame, {}, work)
on = true
const t0 = performance.now()
for (let i = 0; i < iterations; i++) { last = performance.now(); const r = decodeCounted(frame, {}); if (r && which !== 'clean') throw Error('read') }
const total = (performance.now() - t0) / iterations
const per = table => Object.fromEntries(Object.entries(table).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, +(b / iterations).toFixed(3)]))]))
console.log(JSON.stringify({ frame: which, totalMs: +total.toFixed(3), work, stages: per(stats.stages), finders: per(stats.finders), locate: per(stats.locate), read: per(stats.read) }, null, 1))
