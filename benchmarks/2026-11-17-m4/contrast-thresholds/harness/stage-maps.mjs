// Maps and second looks the terminal stage spends on each gained frame and on
// the mixed codeless frames, from a diagnostic build that exposes them.
// node stage-maps.mjs <root> <rivals> <instrumentedDist> <terminal-summary.json> <fresh.json>
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { corpus } from '../../noise-policy-screen/harness/corpus.mjs'
import { freshFrames } from './fresh.mjs'
const [root, rivals, dist, summaryPath, freshPath] = process.argv.slice(2).map(p => resolve(p))
const { decodeCounted } = await import(pathToFileURL(dist + '/decode.js'))
const stage = () => globalThis.__contrastWork
const gainedCorpus = JSON.parse(readFileSync(summaryPath, 'utf8')).differences.cand.filter(d => d.kind === 'gained').map(d => `${d.suite}/${d.name}`)
const rows = []
for await (const item of corpus(root, rivals, [...new Set(gainedCorpus.map(n => n.split('/')[0]))])) {
  if (!gainedCorpus.includes(`${item.suite}/${item.name}`)) continue
  globalThis.__contrastWork = undefined
  const r = decodeCounted(item.image)
  rows.push({ name: `${item.suite}/${item.name}`, ok: r?.text === item.text, maps: stage()?.maps, second: stage()?.second })
}
const ext = createRequire(rivals + '/package.json'), qrcode = ext('qrcode')
const encode = (text, ecc) => { const q = qrcode.create(text, { errorCorrectionLevel: ecc }); return { size: q.modules.size, modules: q.modules.data } }
const fresh = JSON.parse(readFileSync(freshPath, 'utf8')).rows
const gainedFresh = new Set(fresh.filter(r => r.positive && r.v.base.s !== 'correct' && r.v.cand.s === 'correct').map(r => r.name))
for (const f of freshFrames(encode)) {
  const negative = f.text === null
  if (!gainedFresh.has(f.name) && !negative) continue
  globalThis.__contrastWork = undefined
  const r = decodeCounted({ data: f.data, width: f.width, height: f.height })
  rows.push({ name: f.name, ok: negative ? r === undefined : r?.text === f.text, maps: stage()?.maps, second: stage()?.second, negative })
}
const gains = rows.filter(r => !r.negative), negatives = rows.filter(r => r.negative)
const dist1 = v => { const s = v.filter(x => x !== undefined).sort((a, b) => a - b); return { n: s.length, median: s[s.length >> 1], p90: s[Math.floor(s.length * 0.9)], max: s.at(-1) } }
console.log('gains all ok:', gains.every(r => r.ok), 'count', gains.length, 'maps', JSON.stringify(dist1(gains.map(r => r.maps))))
console.log('gain maps histogram', JSON.stringify(Object.entries(gains.reduce((h, r) => (h[r.maps] = (h[r.maps] ?? 0) + 1, h), {})).sort((a, b) => a[0] - b[0])))
console.log('gains needing a second look:', gains.filter(r => r.second > 0).map(r => `${r.name}:${r.maps}`).join(' '))
console.log('negatives all clean:', negatives.every(r => r.ok), 'stage ran on', negatives.filter(r => r.maps !== undefined).length, 'of', negatives.length, 'maps', JSON.stringify(dist1(negatives.map(r => r.maps))))
