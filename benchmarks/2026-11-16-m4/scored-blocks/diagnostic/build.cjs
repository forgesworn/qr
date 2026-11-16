const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
if (!process.argv[2]) throw Error('Usage: node build.cjs <repo-root> [output-directory]');
const root = path.resolve(process.argv[2]);
const dst = process.argv[3] ? path.resolve(process.argv[3]) : fs.mkdtempSync(path.join(os.tmpdir(), 'qr-scored-blocks-generated-'));
const rev = 'fabe7f295c6ceffecb96f62d4585a59784838c8c';
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
    if (dir === 'instrumented') {
      s = sub(s, '    const scored: { p: Point; score: number; away: number }[] = []', '    const scored: { p: Point; score: number; away: number }[] = []\n    globalThis.__blocks.start(scored)');
      s = sub(s, 'if (scored.some((a) => Math.abs(a.p.x - p.x) <= radius && Math.abs(a.p.y - p.y) <= radius && distance(a.p, p) <= radius)) continue', 'if (globalThis.__blocks.query(scored, p, radius, distance)) continue');
      s = sub(s, '          scored.push({ p, score, away: near(p) })', '          scored.push({ p, score, away: near(p) })\n          globalThis.__blocks.insert(scored, p)');
    }
  }
  fs.writeFileSync(path.join(dst, dir, file.replace(/\.ts$/, '.js')), ts.transpileModule(s, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
}
for (const file of ['png.ts', 'photo.ts']) fs.writeFileSync(path.join(dst, file.replace('.ts', '.js')), ts.transpileModule(fs.readFileSync(path.join(dst, 'snapshot/test', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
fs.writeFileSync(path.join(dst, 'package.json'), '{"type":"module"}'); console.log(dst);
