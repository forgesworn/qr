const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node build.cjs <repo-root> <output-directory>');
const root = path.resolve(process.argv[2]), dst = path.resolve(process.argv[3]);
const rev = '3c06d8047287994a6e071e87425de1b04cc66d10', ts = require(path.join(root, 'node_modules/typescript'));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
for (const d of ['base', 'instrumented', 'snapshot/src', 'snapshot/test']) fs.mkdirSync(path.join(dst, d), { recursive: true });
for (const name of git('ls-tree', '-r', '--name-only', rev, 'src', 'test/photo.ts', 'test/png.ts').trim().split('\n')) {
  const out = path.join(dst, 'snapshot', name); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, git('show', `${rev}:${name}`));
}
for (const name of ['generate.mjs', 'photo.mjs', 'photo.ts', 'manifest.json']) {
  const file = `benchmarks/2026-11-16-m4/fresh-stress-unevaluated/${name}`, out = path.join(dst, 'fixture', name);
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, execFileSync('git', ['show', `${rev}:${file}`], { cwd: root }));
}
const sub = (s, a, b) => { if (s.indexOf(a) < 0 || s.indexOf(a) !== s.lastIndexOf(a)) throw Error('not unique: ' + a); return s.replace(a, b); };
for (const dir of ['base', 'instrumented']) fs.writeFileSync(path.join(dst, dir, 'package.json'), '{"type":"module"}');
for (const file of fs.readdirSync(path.join(dst, 'snapshot/src')).filter(f => f.endsWith('.ts'))) for (const dir of ['base', 'instrumented']) {
  let s = fs.readFileSync(path.join(dst, 'snapshot/src', file), 'utf8');
  if (file === 'locate.ts') {
    s = sub(s, '  return found.sort((a, b) => b.count - a.count)', '  const sorted = found.sort((a, b) => b.count - a.count)\n  globalThis.__finderOutput(sorted)\n  return sorted');
  }
  if (file === 'decode.ts' && dir === 'instrumented') {
    s = sub(s, 'search(bits, edges, false, candidates, budget, strict, f, work)', "globalThis.__v40.search({ f, inverted: false, strict, strictOverride, budget, candidates }, () => search(bits, edges, false, candidates, budget, strict, f, work))");
    s = sub(s, 'search(invert(bits), edges, true, candidates, budget, strict, f, work)', "globalThis.__v40.search({ f, inverted: true, strict, strictOverride, budget, candidates }, () => search(invert(bits), edges, true, candidates, budget, strict, f, work))");
    s = sub(s, '  const levels = thresholds(luminance)', '  globalThis.__v40.look({ f, inversion, strictOverride, budget: { ...budget } })\n  const levels = thresholds(luminance)');
    s = sub(s, '    const triples = finderTriples(image, findFinders(image, tolerance, work, edges)).slice(0, MAX_TRIPLES)', '    const finders = findFinders(image, tolerance, work, edges)\n    const ranked = finderTriples(image, finders)\n    globalThis.__v40.finders({ f, inverted, strict, tolerance, finders, ranked, budget: { ...budget } })\n    const triples = ranked.slice(0, MAX_TRIPLES)');
    s = sub(s, '      const first = locate(image, triple, undefined, work, edges)', '      const first = globalThis.__v40.locate({ f, inverted, strict, tolerance, delta: 0, triple, budget: { ...budget } }, () => locate(image, triple, undefined, work, edges))');
    s = sub(s, '      if (size === undefined) continue', '      globalThis.__v40.estimate({ f, inverted, strict, tolerance, triple, size, budget: { ...budget } })\n      if (size === undefined) continue');
    s = sub(s, 'delta === 0 ? first : locate(image, triple, size + delta, work, edges)', 'delta === 0 ? first : globalThis.__v40.locate({ f, inverted, strict, tolerance, delta, triple, budget: { ...budget } }, () => locate(image, triple, size + delta, work, edges))');
    s = sub(s, '          const result = read(image, location, inverted, candidates, strict, f)', '          const result = globalThis.__v40.read({ f, inverted, strict, tolerance, delta, location, budget: { ...budget } }, () => read(image, location, inverted, candidates, strict, f), candidates)');
    s = sub(s, '    const result = secondLook(luminance, levels, candidate, work, strict)', '    const result = globalThis.__v40.second({ f, strict, candidate, budget: { ...budget } }, () => secondLook(luminance, levels, candidate, work, strict))');
    s = sub(s, '    if (strict && !formatAgrees(straightRead, size, straight.ecc, straight.mask)) return undefined', "    if (strict && !formatAgrees(straightRead, size, straight.ecc, straight.mask)) { globalThis.__v40.event('strict-straight-format'); return undefined }");
    s = sub(s, '    if (strict && !formatAgrees(mirroredRead, size, mirrored.ecc, mirrored.mask)) return undefined', "    if (strict && !formatAgrees(mirroredRead, size, mirrored.ecc, mirrored.mask)) { globalThis.__v40.event('strict-mirrored-format'); return undefined }");
    s = sub(s, '  if (strict && !agreementRead(sample, size)) return undefined', "  if (strict && !agreementRead(sample, size)) { globalThis.__v40.event('strict-agreement'); return undefined }");
    s = sub(s, '  const agreed = agreement(modules, size)', "  const agreed = agreement(modules, size)\n  globalThis.__v40.event(agreed ? 'queue-agreement' : 'queue-no-agreement')");
    s = sub(s, '  const size = estimateSize(image, triple)', "  const size = estimateSize(image, triple)\n  globalThis.__v40.event('over-estimate', { size })");
  }
  if (file === 'refine.ts' && dir === 'instrumented') {
    s = sub(s, '  if (result === undefined || result.ecc !== candidate.ecc || result.mask !== candidate.mask) return undefined', "  if (result === undefined || result.ecc !== candidate.ecc || result.mask !== candidate.mask) { globalThis.__v40.event('second-symbol-or-format-mismatch', { present: result !== undefined }); return undefined }");
    s = sub(s, '  if (strict && !formatAgrees(read, size, result.ecc, result.mask)) return undefined', "  if (strict && !formatAgrees(read, size, result.ecc, result.mask)) { globalThis.__v40.event('second-strict-format'); return undefined }");
  }
  if (file === 'symbol.ts' && dir === 'instrumented') {
    s = sub(s, 'export function readSymbol(read: ModuleReader, size: number): Payload | undefined {', "export function readSymbol(read: ModuleReader, size: number): Payload | undefined {\n  globalThis.__v40.event('symbol-enter', { size })");
    s = sub(s, '  const version = readVersion(read, size) ?? (size - 17) / 4', "  const encodedVersion = readVersion(read, size)\n  const version = encodedVersion ?? (size - 17) / 4\n  globalThis.__v40.event('symbol-version', { encodedVersion, version, size })");
    s = sub(s, '  if (17 + 4 * version !== size) return undefined', "  if (17 + 4 * version !== size) { globalThis.__v40.event('symbol-version-mismatch', { size, version }); return undefined }");
    s = sub(s, '  if (format === undefined) return undefined', "  if (format === undefined) { globalThis.__v40.event('symbol-format-miss', { size, version, first, second }); return undefined }\n  globalThis.__v40.event('symbol-format', { size, version, ecc: format.ecc, mask: format.mask })");
    s = sub(s, '    if (fixed < 0 || fixed > limit) return undefined', "    if (fixed < 0 || fixed > limit) { globalThis.__v40.event('symbol-rs-fail', { size, version, block: b, fixed, limit }); return undefined }");
    s = sub(s, '  if (data.every((word) => word === 0)) return undefined', "  if (data.every((word) => word === 0)) { globalThis.__v40.event('symbol-zero'); return undefined }");
    s = sub(s, '  if (parsed === undefined) return undefined', "  if (parsed === undefined) { globalThis.__v40.event('symbol-parse-fail'); return undefined }");
  }
  fs.writeFileSync(path.join(dst, dir, file.replace(/\.ts$/, '.js')), ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
}
for (const file of ['png.ts', 'photo.ts']) fs.writeFileSync(path.join(dst, file.replace('.ts', '.js')), ts.transpileModule(fs.readFileSync(path.join(dst, 'snapshot/test', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
fs.writeFileSync(path.join(dst, 'package.json'), '{"type":"module"}'); console.log(dst);
