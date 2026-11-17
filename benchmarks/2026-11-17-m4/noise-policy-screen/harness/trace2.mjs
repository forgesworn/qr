// Copies a dist directory and inserts hooks reporting tried triples, maps and the returning stage. Diagnostic only.
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
const [from, to] = process.argv.slice(2)
cpSync(from, to, { recursive: true })
const file = `${to}/decode.js`
let src = readFileSync(file, 'utf8')
const swap = (a, b) => {
  const n = src.split(a).length - 1
  if (n !== 1) throw Error(`pattern found ${n} times: ${a.slice(0, 60)}`)
  src = src.replace(a, b)
}
const T = 'globalThis.__t'
swap('const triples = ranked.slice(0, MAX_TRIPLES);', `const triples = ranked.slice(0, MAX_TRIPLES); let __rank = -1;`)
swap('const first = locate(image, triple, undefined, work, edges);', `__rank++; const first = locate(image, triple, undefined, work, edges);`)
swap('const result = read(image, location, inverted, candidates, strict, f, collectHints ? budget.hints : undefined, triple, collectHints ? budget.curvature : inverseCurvature, collectHints || inverseCurvature ? budget : undefined, inverseCurvature !== undefined);',
  `const result = read(image, location, inverted, candidates, strict, f, collectHints ? budget.hints : undefined, triple, collectHints ? budget.curvature : inverseCurvature, collectHints || inverseCurvature ? budget : undefined, inverseCurvature !== undefined); ${T}?.map(f, inverted, tolerance, __rank, triple, delta, location, !!result, strict, collectHints, inverseCurvature !== undefined);`)
for (const [call, name] of [
  ['const found = look(luminance, inversion, 1, budget, work);\n    if (found)\n        return found;', 'full'],
  ['const reduced = look(shrunk(f), inversion, f, budget, work);\n        if (reduced)\n            return reduced;', 'reduced'],
  [`const fallback = look(inverse, 'normal', 1, budget, work, true, inverseCurvature, true);\n        if (fallback)\n            return { ...fallback, inverted: true };`, 'inverse-full'],
  [`const reduced = look(inverseShrunk(f), 'normal', f, budget, work, true, undefined, true);\n            if (reduced)\n                return { ...reduced, inverted: true };`, 'inverse-reduced'],
]) swap(call, call.replace(/return /, `{ ${T}?.stage('${name}'); return `).replace(/;$/, '; }'))
for (const name of ['recoverVersion', 'recoverOverflow', 'recoverCurvature', 'recoverMeshGrids', 'recoverUnattemptedCurvature', 'recoverHeaderConflict', 'recoverOrdinaryCurvature', 'recoverVersionPeer', 'recoverAlternateGrid', 'recoverQuadraticMesh']) {
  const re = new RegExp(`(const (\\w+) = ${name}\\([^;]*\\);\\n\\s*if \\(\\2\\))\\n\\s*return ([^\\n]*);`, 'g')
  let n = 0
  src = src.replace(re, (m, head, v, expr) => { n++; return `${head} { ${T}?.stage('${name}'); return ${expr}; }` })
  if (n === 0) throw Error('no stage ' + name)
}
swap('const rediscovered = recoverRediscoveredGrid(budget);', `const rediscovered = recoverRediscoveredGrid(budget); if (rediscovered) ${T}?.stage('recoverRediscoveredGrid');`)
swap('const selectedMesh = recoverRediscoveredGrid(budget, true);', `const selectedMesh = recoverRediscoveredGrid(budget, true); if (selectedMesh) ${T}?.stage('recoverSelectedMesh');`)
swap('return recoverLowResolution(luminance, inverse, budget, inversion);', `{ const __low = recoverLowResolution(luminance, inverse, budget, inversion); if (__low) ${T}?.stage('recoverLowResolution'); return __low; }`)
writeFileSync(file, src)
console.log('traced', to)
