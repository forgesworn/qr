// Markdown tables from the recorded results in this directory. node tables.mjs <dir>
import { existsSync, readFileSync } from 'node:fs'
const dir = process.argv[2]
const read = f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
const corpus = read('regression.json'), fresh = read('fresh.json').summary, second = read('fresh-second.json').summary
const out = []
out.push('| Regression suite | Images | Base correct | Candidate correct | Gained | Lost | Wrong | False reads |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
const diffs = corpus.differences.final ?? []
let totals = [0, 0, 0, 0, 0, 0, 0]
for (const [suite, v] of Object.entries(corpus.suites)) {
  const n = Object.values(v.base).slice(0, 7).reduce((a, b) => a + b, 0)
  const gained = diffs.filter(d => d.suite === suite && d.kind === 'gained').length, lost = diffs.filter(d => d.suite === suite && d.kind !== 'gained').length
  out.push(`| ${suite} | ${n} | ${v.base.correct} | ${v.final.correct} | ${gained} | ${lost} | ${v.final.wrong} | ${v.final.negativeFalse} |`)
  totals = totals.map((t, i) => t + [n, v.base.correct, v.final.correct, gained, lost, v.final.wrong, v.final.negativeFalse][i])
}
out.push(`| **All** | ${totals[0]} | ${totals[1]} | **${totals[2]}** | ${totals[3]} | ${totals[4]} | ${totals[5]} | ${totals[6]} |`, '')
out.push('Gained: ' + diffs.filter(d => d.kind === 'gained').map(d => `\`${d.suite}/${d.name}\``).join(', ') + '.', '')
out.push('| Fresh scope | Base | Candidate | ZXing-WASM 3.1.7 |', '| --- | ---: | ---: | ---: |')
const row = (label, t) => out.push(`| ${label} | ${t.base.correct} | **${t.final.correct}** | ${t.zxing.correct} |`)
row('All 480 positives', fresh.all)
for (const [band, t] of Object.entries(fresh.byContrast)) row(`Contrast ${band} (${t.base.correct + t.base.miss + t.base.wrong})`, t)
for (const [band, t] of Object.entries(fresh.byScale)) row(`${band} px a module (${t.base.correct + t.base.miss + t.base.wrong})`, t)
for (const [b, t] of Object.entries(fresh.byBlur)) row(`Blur passes ${b} (${t.base.correct + t.base.miss + t.base.wrong})`, t)
row(`Light on dark (${fresh.inverted.base.correct + fresh.inverted.base.miss})`, fresh.inverted)
out.push(`| 96 negatives rejected | ${fresh.all.base.negativeClean} | **${fresh.all.final.negativeClean}** | ${fresh.all.zxing.negativeClean} |`)
out.push(`| Wrong payloads | ${fresh.all.base.wrong} | ${fresh.all.final.wrong} | ${fresh.all.zxing.wrong} |`, '')
out.push('ZXing-only against the candidate: ' + (fresh.zxingOnlyAgainstLast.join(', ') || 'none') + '.', '')
out.push('| Second fresh set | Base | Candidate | ZXing-WASM 3.1.7 |', '| --- | ---: | ---: | ---: |')
const row2 = (label, t) => out.push(`| ${label} | ${t.base.correct} | **${t.final.correct}** | ${t.zxing.correct} |`)
row2(`All ${second.positives} positives`, second.all)
for (const [band, t] of Object.entries(second.byContrast)) row2(`Contrast ${band} (${t.base.correct + t.base.miss + t.base.wrong})`, t)
out.push(`| ${second.negatives} negatives rejected | ${second.all.base.negativeClean} | **${second.all.final.negativeClean}** | ${second.all.zxing.negativeClean} |`)
out.push(`| Wrong payloads | ${second.all.base.wrong} | ${second.all.final.wrong} | ${second.all.zxing.wrong} |`, '')
out.push('ZXing-only against the candidate, second set: ' + (second.zxingOnlyAgainstLast.join(', ') || 'none') + '.', '')
const stage = read('stage.json')
out.push('| Stage-targeted kind | Frames | Reaching step 23 | Base | Candidate |', '| --- | ---: | ---: | --- | --- |')
for (const [kind, k] of Object.entries(stage.byKind)) {
  const fmt = v => Object.entries(k).filter(([key]) => key.startsWith(v + ':')).map(([key, n]) => `${n} ${key.split(':')[1]}`).join(', ')
  out.push(`| ${kind} | ${k.n} | ${k.reach} | ${fmt('base')} | ${fmt('final')} |`)
}
out.push('')
// Every numbered run present, plus an optional A/A run of the base against itself.
const runs = (stem, key) => { const found = []; for (let n = 1; existsSync(`${dir}/${stem}-${n}.json`); n++) found.push(read(`${stem}-${n}.json`)[key]); return found }
const pct = v => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`
const span = values => `${Math.min(...values).toFixed(3)}–${Math.max(...values).toFixed(3)}`
const ts = runs("timing", "results"), tsAa = existsSync(`${dir}/timing-aa.json`) ? read("timing-aa.json").results : null
out.push(`| Frame, 1280x720 | Read | Base median, ms | Candidate median, ms | Change, runs 1 to ${ts.length} |${tsAa ? " A/A |" : ""}`, `| --- | --- | ---: | ---: | ---: |${tsAa ? " ---: |" : ""}`)
for (const a of ts[0]) {
  const rows = ts.map(run => run.find(r => r.name === a.name)), aa = tsAa?.find(r => r.name === a.name)
  out.push(`| ${a.name} | ${a.read ? "yes" : "no"} | ${span(rows.map(r => r.baseMedianMs))} | ${span(rows.map(r => r.candMedianMs))} | ${rows.map(r => pct(r.changePct)).join(" / ")} |${aa ? ` ${pct(aa.changePct)} |` : ""}`)
}
const wt = runs("wasm-timing", "results")
out.push("", `| WASM frame, 1280x720 | Before median, ms | After median, ms | Change, runs 1 to ${wt.length} |`, "| --- | ---: | ---: | ---: |")
for (const a of wt[0]) {
  const rows = wt.map(run => run.find(r => r.name === a.name))
  out.push(`| ${a.name} | ${span(rows.map(r => r.beforeMedianMs))} | ${span(rows.map(r => r.afterMedianMs))} | ${rows.map(r => pct(r.changePct)).join(" / ")} |`)
}
const cw = runs("compare-wasm", "rows"), cwAa = existsSync(`${dir}/compare-wasm-aa.json`) ? read("compare-wasm-aa.json").rows : null
if (cw.length) {
  const change = r => 100 * (r.after.medianMs / r.before.medianMs - 1)
  out.push("", `| compare-wasm frame | Size | Before median, ms | After median, ms | Change, runs 1 to ${cw.length} |${cwAa ? " A/A |" : ""}`, `| --- | --- | ---: | ---: | ---: |${cwAa ? " ---: |" : ""}`)
  for (const a of cw[0]) {
    const rows = cw.map(run => run.find(r => r.name === a.name)), aa = cwAa?.find(r => r.name === a.name)
    out.push(`| ${a.name} | ${a.width}x${a.height} | ${span(rows.map(r => r.before.medianMs))} | ${span(rows.map(r => r.after.medianMs))} | ${rows.map(r => pct(change(r))).join(" / ")} |${aa ? ` ${pct(change(aa))} |` : ""}`)
  }
}
const parity = read("parity.json")
out.push("", `TypeScript and WASM public results: ${parity.same} of ${parity.count} identical (${parity.reads} reads).`)
console.log(out.join("\n"))
