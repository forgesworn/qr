const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
if (!process.argv[2]) throw Error('Usage: node build.cjs <repo-root> [output-directory]');
const root = path.resolve(process.argv[2]);
const dst = process.argv[3] ? path.resolve(process.argv[3]) : fs.mkdtempSync(path.join(os.tmpdir(), 'qr-ratio-order-generated-'));
const rev = 'bd23ee348e9f70fe8365c41ebcd3c54d165741f5';
const ts = require(path.join(root, 'node_modules/typescript'));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
for (const d of ['base', 'instrumented', 'snapshot/src', 'snapshot/test']) fs.mkdirSync(path.join(dst, d), { recursive: true });
for (const name of git('ls-tree', '-r', '--name-only', rev, 'src', 'test/photo.ts', 'test/png.ts').trim().split('\n')) {
  const out = path.join(dst, 'snapshot', name); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, git('show', `${rev}:${name}`));
}
for (const name of ['noise', 'gradient', 'finder-tiles', 'bent-version-4', 'bent-version-12', 'close-up-format-damaged', 'inverted-flat-blocks-mirrored']) {
  const file = `vectors/conformance/${name}.png`, out = path.join(dst, 'snapshot', file)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, execFileSync('git', ['show', `${rev}:${file}`], { cwd: root }))
}
const sub = (s, a, b) => { if (s.indexOf(a) < 0 || s.indexOf(a) !== s.lastIndexOf(a)) throw Error('not unique: ' + a); return s.replace(a, b); };
for (const dir of ['base', 'instrumented']) fs.writeFileSync(path.join(dst, dir, 'package.json'), '{"type":"module"}');
for (const file of fs.readdirSync(path.join(dst, 'snapshot/src')).filter(f => f.endsWith('.ts'))) for (const dir of ['base', 'instrumented']) {
  let s = fs.readFileSync(path.join(dst, 'snapshot/src', file), 'utf8');
  if (file === 'locate.ts') {
    s = sub(s, '  return found.sort((a, b) => b.count - a.count)', '  const sorted = found.sort((a, b) => b.count - a.count)\n  globalThis.__finderOutput(sorted)\n  return sorted');
    s = sub(s, 'k += finderRatio(counts, tolerance) && consider(counts, y, end) ? 6 : 2', 'k += globalThis.__traceStep(counts, y, end, k, () => finderRatio(counts, tolerance), () => consider(counts, y, end))');
    if (dir === 'instrumented') {
      s = sub(s, 'function finderRatioScalars(c0: number, c1: number, c2: number, c3: number, c4: number, tolerance: number): boolean {', 'function finderRatioScalarsOriginal(c0: number, c1: number, c2: number, c3: number, c4: number, tolerance: number): boolean {');
      s = sub(s, 'function finderRatioScalarsOriginal(', 'function finderRatioScalars(c0: number, c1: number, c2: number, c3: number, c4: number, tolerance: number, stage: string): boolean {\n  const original = finderRatioScalarsOriginal(c0, c1, c2, c3, c4, tolerance)\n  globalThis.__ratio.observe([c0, c1, c2, c3, c4], tolerance, stage, original)\n  return original\n}\n\nfunction finderRatioScalarsOriginal(');
      s = sub(s, 'counts[4]!, tolerance)', "counts[4]!, tolerance, 'row')");
      s = sub(s, 'finderRatioScalars(c0, c1, c2, c3, c4, tolerance))', "finderRatioScalars(c0, c1, c2, c3, c4, tolerance, dx && dy ? 'diagonal' : dy ? 'vertical' : 'horizontal'))");
    }
  }
  fs.writeFileSync(path.join(dst, dir, file.replace(/\.ts$/, '.js')), ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
}
for (const file of ['png.ts', 'photo.ts']) fs.writeFileSync(path.join(dst, file.replace('.ts', '.js')), ts.transpileModule(fs.readFileSync(path.join(dst, 'snapshot/test', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
fs.writeFileSync(path.join(dst, 'package.json'), '{"type":"module"}'); console.log(dst);
