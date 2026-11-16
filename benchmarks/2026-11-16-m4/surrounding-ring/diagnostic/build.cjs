const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node build.cjs <repo-root> <output-directory>');
const root = path.resolve(process.argv[2]), dst = path.resolve(process.argv[3]);
const rev = '5d468499de3127664b462fc646f10b807b86209d', ts = require(path.join(root, 'node_modules/typescript'));
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
      s = sub(s, '  globalThis.__finderOutput(sorted)', '  globalThis.__finderOutput(sorted)\n  globalThis.__ring.finalFinders(sorted)');
      s = sub(s, '    const moduleSize = total / 7\n    // The earliest stored candidate', '    const moduleSize = total / 7\n    const ring = globalThis.__ring.sighting(image, cx, cy, moduleSize)\n    // The earliest stored candidate');
      s = sub(s, '      const f = found[match]!\n      const before', '      const f = found[match]!\n      globalThis.__ring.link(f, ring)\n      const before');
      s = sub(s, '    file(found.length - 1)\n    return true', '    file(found.length - 1)\n    globalThis.__ring.link(found[found.length - 1], ring)\n    return true');
    }
  }
  if (file === 'decode.ts' && dir === 'instrumented') {
    s = sub(s, '    const triples = finderTriples(image, findFinders(image, tolerance, work, edges)).slice(0, MAX_TRIPLES)', '    const ranked = finderTriples(image, findFinders(image, tolerance, work, edges))\n    globalThis.__ring.ranked(ranked)\n    const triples = ranked.slice(0, MAX_TRIPLES)');
    s = sub(s, '      const first = locate(image, triple, undefined, work, edges)', '      const first = globalThis.__ring.locate(triple, work, () => locate(image, triple, undefined, work, edges))');
    s = sub(s, 'delta === 0 ? first : locate(image, triple, size + delta, work, edges)', 'delta === 0 ? first : globalThis.__ring.locate(triple, work, () => locate(image, triple, size + delta, work, edges))');
    s = sub(s, '          const result = read(image, location, inverted, candidates, strict, f)', '          globalThis.__ring.map(location)\n          const result = read(image, location, inverted, candidates, strict, f)');
    s = sub(s, '          if (result) return result', "          if (result) { globalThis.__ring.success(location, 'ordinary'); return result }");
    s = sub(s, '    if (result) return { ...result, mirrored: candidate.mirrored, inverted: candidate.inverted, location: where(candidate.location, f) }', "    if (result) { globalThis.__ring.success(candidate.location, 'second'); return { ...result, mirrored: candidate.mirrored, inverted: candidate.inverted, location: where(candidate.location, f) } }");
  }
  fs.writeFileSync(path.join(dst, dir, file.replace(/\.ts$/, '.js')), ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
}
for (const file of ['png.ts', 'photo.ts']) fs.writeFileSync(path.join(dst, file.replace('.ts', '.js')), ts.transpileModule(fs.readFileSync(path.join(dst, 'snapshot/test', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
fs.writeFileSync(path.join(dst, 'package.json'), '{"type":"module"}'); console.log(dst);

fs.copyFileSync(path.join(__dirname, 'observer.mjs'), path.join(dst, 'observer.mjs'));
