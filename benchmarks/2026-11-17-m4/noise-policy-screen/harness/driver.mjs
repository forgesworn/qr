// Runs runner.mjs shards in parallel and summarises against the first variant. Diagnostic only.
// node driver.mjs <root> <rivals> <shards> <outdir> <name=dist>... [--only suites]
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const argv = process.argv.slice(2)
const [root, rivals, shardsArg, outdir, ...rest] = argv
const shards = Number(shardsArg)
mkdirSync(outdir, { recursive: true })
const t0 = Date.now()
await Promise.all(Array.from({ length: shards }, (_, k) => new Promise((ok, fail) => {
  const child = spawn(process.execPath, [new URL('./runner.mjs', import.meta.url).pathname, root, rivals, String(k), String(shards), `${outdir}/shard-${k}.jsonl`, ...rest], { stdio: ['ignore', 'inherit', 'inherit'] })
  child.on('exit', code => code === 0 ? ok() : fail(Error(`shard ${k} exited ${code}`)))
})))
const rows = []
for (let k = 0; k < shards; k++) for (const line of readFileSync(`${outdir}/shard-${k}.jsonl`, 'utf8').split('\n')) if (line) rows.push(JSON.parse(line))
rows.sort((a, b) => a.i - b.i)
const names = Object.keys(rows[0].v), base = names[0]
const summary = { seconds: (Date.now() - t0) / 1000, count: rows.length, suites: {}, differences: {} }
for (const row of rows) {
  const s = summary.suites[row.suite] ??= Object.fromEntries(names.map(n => [n, { correct: 0, read: 0, miss: 0, none: 0, wrong: 0, negativeClean: 0, negativeFalse: 0, maps: 0, ms: 0 }]))
  for (const n of names) { s[n][row.v[n].s]++; s[n].maps += row.v[n].work.maps; s[n].ms += row.v[n].ms }
  for (const n of names.slice(1)) {
    const a = row.v[base], b = row.v[n]
    if (a.h === b.h) continue
    const kind = a.h && !b.h ? 'lost' : !a.h && b.h ? 'gained' : 'changed'
    ;(summary.differences[n] ??= []).push({ suite: row.suite, name: row.name, kind, base: a.s, variant: b.s, baseMaps: a.work.maps, variantMaps: b.work.maps })
  }
}
for (const s of Object.values(summary.suites)) for (const v of Object.values(s)) v.ms = +v.ms.toFixed(1)
writeFileSync(`${outdir}/summary.json`, JSON.stringify(summary, null, 1))
console.log(JSON.stringify({ seconds: summary.seconds, count: summary.count, suites: summary.suites }, null, 0))
for (const [n, d] of Object.entries(summary.differences)) {
  const counts = {}
  for (const x of d) counts[`${x.suite}:${x.kind}`] = (counts[`${x.suite}:${x.kind}`] ?? 0) + 1
  console.log(n, JSON.stringify(counts))
}
