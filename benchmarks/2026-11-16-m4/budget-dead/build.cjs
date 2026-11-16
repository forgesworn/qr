const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node build.cjs <repo-root> <output-directory>');
const root = path.resolve(process.argv[2]), dst = path.resolve(process.argv[3]);
const rev = '8aca1e4d3ca6756553dbea93432866d4d02d5f7b', ts = require(path.join(root, 'node_modules/typescript'));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
for (const d of ['base', 'instrumented', 'snapshot/src', 'snapshot/test']) fs.mkdirSync(path.join(dst, d), { recursive: true });
for (const name of git('ls-tree', '-r', '--name-only', rev, 'src', 'test/photo.ts', 'test/png.ts').trim().split('\n')) {
  const out = path.join(dst, 'snapshot', name); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, git('show', `${rev}:${name}`));
}
for (const name of ['noise', 'gradient', 'finder-tiles', 'bent-version-4', 'bent-version-12', 'close-up-format-damaged', 'inverted-flat-blocks-mirrored']) {
  const file = `vectors/conformance/${name}.png`, out = path.join(dst, 'snapshot', file); fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, execFileSync('git', ['show', `${rev}:${file}`], { cwd: root }));
}
const sub = (s, a, b) => { if (s.indexOf(a) < 0 || s.indexOf(a) !== s.lastIndexOf(a)) throw Error('not unique: ' + a); return s.replace(a, b); };
for (const dir of ['base', 'instrumented']) fs.writeFileSync(path.join(dst, dir, 'package.json'), '{"type":"module"}');
for (const file of fs.readdirSync(path.join(dst, 'snapshot/src')).filter(f => f.endsWith('.ts'))) for (const dir of ['base', 'instrumented']) {
  let s = fs.readFileSync(path.join(dst, 'snapshot/src', file), 'utf8');
  if (file === 'locate.ts') {
    s = sub(s, '  return found.sort((a, b) => b.count - a.count)', '  const sorted = found.sort((a, b) => b.count - a.count)\n  globalThis.__finderOutput(sorted)\n  return sorted');
    if (dir === 'instrumented') {
      s = sub(s, '      if (edges === undefined) {', '      if (edges === undefined) {\n        globalThis.__dead.edge(width)');
      s = sub(s, '    while (k <= changes.length) {', '    while (k <= changes.length) {\n      globalThis.__dead.rowWindow()');
    }
  }
  if (file === 'decode.ts' && dir === 'instrumented') {
    s = sub(s, 'search(bits, edges, false, candidates, budget, strict, f, work)', "globalThis.__dead.phase('search', { inverted: false, strict, f, strictOverride, candidates }, budget, work, () => search(bits, edges, false, candidates, budget, strict, f, work, strictOverride))");
    s = sub(s, 'search(invert(bits), edges, true, candidates, budget, strict, f, work)', "globalThis.__dead.phase('search', { inverted: true, strict, f, strictOverride, candidates }, budget, work, () => search(invert(bits), edges, true, candidates, budget, strict, f, work, strictOverride))");
    s = sub(s, '    budget.second--\n    if (work) work.second++', '    globalThis.__dead.second(candidates, budget, { strict, f, strictOverride })\n    budget.second--\n    if (work) work.second++');
    s = sub(s, '  f: number,\n  work?: Work,\n): DecodeResult | undefined {\n  // A strict pass first;', '  f: number,\n  work?: Work,\n  strictOverride = false,\n): DecodeResult | undefined {\n  // A strict pass first;');
    s = sub(s, '    const triples = finderTriples(image, findFinders(image, tolerance, work, edges)).slice(0, MAX_TRIPLES)', "    const found = globalThis.__dead.phase('finders', { inverted, strict, f, strictOverride, tolerance }, budget, work, () => findFinders(image, tolerance, work, edges))\n    const triples = globalThis.__dead.phase('triples', { inverted, strict, f, strictOverride, tolerance }, budget, work, () => finderTriples(image, found)).slice(0, MAX_TRIPLES)");
    s = sub(s, '    for (const triple of triples) {\n      const first = locate(image, triple, undefined, work, edges)', "    for (const triple of triples) {\n      globalThis.__dead.event('triple', { inverted, strict, f, strictOverride, tolerance }, budget)\n      const first = globalThis.__dead.phase('locate', { inverted, strict, f, strictOverride, tolerance, delta: 0 }, budget, work, () => locate(image, triple, undefined, work, edges))");
    s = sub(s, 'delta === 0 ? first : locate(image, triple, size + delta, work, edges)', "delta === 0 ? first : globalThis.__dead.phase('locate', { inverted, strict, f, strictOverride, tolerance, delta }, budget, work, () => locate(image, triple, size + delta, work, edges))");
  }
  fs.writeFileSync(path.join(dst, dir, file.replace(/\.ts$/, '.js')), ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
}
for (const file of ['png.ts', 'photo.ts']) fs.writeFileSync(path.join(dst, file.replace('.ts', '.js')), ts.transpileModule(fs.readFileSync(path.join(dst, 'snapshot/test', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
fs.writeFileSync(path.join(dst, 'package.json'), '{"type":"module"}'); console.log(dst);
