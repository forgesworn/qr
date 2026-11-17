// Copies a dist directory and inserts timing hooks into decode.js. Diagnostic only.
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
// Locate timing for the first estimate and the size retries.
swap('const first = locate(image, triple, undefined, work, edges);',
  `const __a = performance.now(); const first = locate(image, triple, undefined, work, edges); ${T}?.locate(f, inverted, tolerance, 0, performance.now() - __a, first.length, first[0]?.size);`)
swap('for (const location of delta === 0 ? first : locate(image, triple, size + delta, work, edges)) {',
  `let __locs; if (delta === 0) __locs = first; else { const __b = performance.now(); __locs = locate(image, triple, size + delta, work, edges); ${T}?.locate(f, inverted, tolerance, delta, performance.now() - __b, __locs.length, size + delta); }
                for (const location of __locs) {`)
swap('const result = read(image, location, inverted, candidates, strict, f, collectHints ? budget.hints : undefined, triple, collectHints ? budget.curvature : inverseCurvature, collectHints || inverseCurvature ? budget : undefined, inverseCurvature !== undefined);',
  `const __c = performance.now(); const result = read(image, location, inverted, candidates, strict, f, collectHints ? budget.hints : undefined, triple, collectHints ? budget.curvature : inverseCurvature, collectHints || inverseCurvature ? budget : undefined, inverseCurvature !== undefined); ${T}?.read(f, inverted, tolerance, delta, performance.now() - __c, !!result);`)
swap('const ranked = finderTriples(image, findFinders(image, tolerance, work, edges));',
  `const __d = performance.now(); const __finders = findFinders(image, tolerance, work, edges); const __e = performance.now(); const ranked = finderTriples(image, __finders); ${T}?.finders(f, inverted, tolerance, __e - __d, performance.now() - __e, __finders.length, ranked.length);`)
// Stage timing around decodeCounted's phases.
swap('const found = look(luminance, inversion, 1, budget, work);',
  `${T}?.stage('luminance'); const found = look(luminance, inversion, 1, budget, work); ${T}?.stage('full');`)
swap('const reduced = look(shrunk(f), inversion, f, budget, work);',
  `const reduced = look(shrunk(f), inversion, f, budget, work); ${T}?.stage('reduced' + f);`)
swap(`const fallback = look(inverse, 'normal', 1, budget, work, true, inverseCurvature, true);`,
  `${T}?.stage('inverse-prep'); const fallback = look(inverse, 'normal', 1, budget, work, true, inverseCurvature, true); ${T}?.stage('inverse-full');`)
swap(`const reduced = look(inverseShrunk(f), 'normal', f, budget, work, true, undefined, true);`,
  `const reduced = look(inverseShrunk(f), 'normal', f, budget, work, true, undefined, true); ${T}?.stage('inverse-reduced' + f);`)
swap('const recovered = recoverVersion(luminance, budget, work);',
  `${T}?.stage('pre-recovery'); const recovered = recoverVersion(luminance, budget, work); ${T}?.stage('recoverVersion');`)
swap('const overflow = recoverOverflow(luminance, budget, work);',
  `const overflow = recoverOverflow(luminance, budget, work); ${T}?.stage('recoverOverflow');`)
swap('return recoverLowResolution(luminance, inverse, budget, inversion);',
  `${T}?.stage('other-recovery'); const __low = recoverLowResolution(luminance, inverse, budget, inversion); ${T}?.stage('lowResolution'); return __low;`)
writeFileSync(file, src)
console.log('patched', file)
