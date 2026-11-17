// Builds the step-9-only allowance and the exempted centre-rule variants. Diagnostic only.
import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
const [from] = process.argv.slice(2)
function variant(to, edits) {
  rmSync(to, { recursive: true, force: true })
  cpSync(from, to, { recursive: true })
  for (const [file, search, replace] of edits) {
    const path = `${to}/${file}`, src = readFileSync(path, 'utf8'), n = src.split(search).length - 1
    if (n !== 1) throw Error(`${to}/${file}: pattern found ${n} times: ${search.slice(0, 50)}`)
    writeFileSync(path, src.replace(search, replace))
  }
  console.log('variant', to)
}
variant('dist-R15s', [['decode.js',
  'budget.here = REDUCED_MAPS;\n        const reduced = look(shrunk(f), inversion, f, budget, work);',
  'budget.here = 15;\n        const reduced = look(shrunk(f), inversion, f, budget, work);']])
variant('dist-L4x', [
  ['locate.js', 'k += finderRatio(counts, tolerance) && consider(counts, y, end) ? 6 : 2;',
    'k += finderRatio(counts, tolerance) && (tolerance === 0.5 || globalThis.__qrEnlarged === true || counts[2] > Math.max(counts[0], counts[4])) && consider(counts, y, end) ? 6 : 2;'],
  ['decode.js', "const found = look(enlarge(source, 4), source === luminance ? inversion : 'normal', 1, retry);",
    "globalThis.__qrEnlarged = true; const found = look(enlarge(source, 4), source === luminance ? inversion : 'normal', 1, retry); globalThis.__qrEnlarged = false;"],
])
