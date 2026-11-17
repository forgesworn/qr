// Centre rule on the loose pass only for windows of 14 pixels or more. Diagnostic only.
import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
const [from] = process.argv.slice(2)
function variant(to, edits) {
  rmSync(to, { recursive: true, force: true })
  cpSync(from, to, { recursive: true })
  for (const [file, search, replace] of edits) {
    const path = `${to}/${file}`, src = readFileSync(path, 'utf8'), n = src.split(search).length - 1
    if (n !== 1) throw Error(`${to}/${file}: pattern found ${n} times`)
    writeFileSync(path, src.replace(search, replace))
  }
  console.log('variant', to)
}
const row = 'k += finderRatio(counts, tolerance) && consider(counts, y, end) ? 6 : 2;'
const rule = exempt => `k += finderRatio(counts, tolerance) && (tolerance === 0.5 || ${exempt ? 'globalThis.__qrEnlarged === true || ' : ''}counts[0] + counts[1] + counts[2] + counts[3] + counts[4] < 14 || counts[2] > Math.max(counts[0], counts[4])) && consider(counts, y, end) ? 6 : 2;`
const enlarged = ["decode.js", "const found = look(enlarge(source, 4), source === luminance ? inversion : 'normal', 1, retry);",
  "globalThis.__qrEnlarged = true; const found = look(enlarge(source, 4), source === luminance ? inversion : 'normal', 1, retry); globalThis.__qrEnlarged = false;"]
variant('dist-L6x', [['locate.js', row, rule(true)], enlarged])
variant('dist-L6', [['locate.js', row, rule(false)]])
