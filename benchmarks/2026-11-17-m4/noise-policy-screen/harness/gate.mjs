// Copies a dist directory and gates size retries on format agreement. Diagnostic only.
// node gate.mjs <from> <to> <charge: none|first> [deltas]
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
const [from, to, charge, deltas = '0, -4, 4, -8, 8'] = process.argv.slice(2)
cpSync(from, to, { recursive: true })
const file = `${to}/decode.js`
let src = readFileSync(file, 'utf8')
const swap = (a, b) => {
  const n = src.split(a).length - 1
  if (n !== 1) throw Error(`pattern found ${n} times: ${a.slice(0, 60)}`)
  src = src.replace(a, b)
}
swap('function read(image, location, inverted, candidates, strict, f, hints, triple, curvature, conflictBudget, inverseLuminance = false) {\n    const { size, project, matrix } = location;',
  'let __agreed = false;\nfunction read(image, location, inverted, candidates, strict, f, hints, triple, curvature, conflictBudget, inverseLuminance = false) {\n    __agreed = false;\n    const { size, project, matrix } = location;')
swap('const straightRead = sample;', 'if (strict) __agreed = true; const straightRead = sample;')
swap('const agreed = agreement(modules, size);', 'const agreed = agreement(modules, size); __agreed = agreed !== undefined;')
const charged = charge === 'first'
  ? 'const __c = Math.min(first.length, budget.maps, budget.here); budget.maps -= __c; budget.here -= __c; if (budget.maps === 0 || budget.here === 0) return undefined;'
  : ''
swap('for (const delta of [0, -4, 4, -8, 8]) {\n                for (const location of delta === 0 ? first : locate(image, triple, size + delta, work, edges)) {',
  `let __evidence = first.length === 0;\n            for (const delta of [${deltas}]) {\n                if (delta !== 0 && !__evidence) { ${charged} continue; }\n                for (const location of delta === 0 ? first : locate(image, triple, size + delta, work, edges)) {`)
swap('if (result)\n                        return result;\n                    if (budget.maps === 0 || budget.here === 0)\n                        return undefined;',
  'if (result)\n                        return result;\n                    __evidence ||= __agreed;\n                    if (budget.maps === 0 || budget.here === 0)\n                        return undefined;')
writeFileSync(file, src)
console.log('gate', to, charge, deltas)
