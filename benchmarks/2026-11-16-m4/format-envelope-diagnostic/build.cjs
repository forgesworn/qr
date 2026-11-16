const fs=require('fs'),path=require('path'),os=require('os');
if(!process.argv[2]) throw Error('Usage: node build.cjs <repo-root> [output-dir]');
const src=path.resolve(process.argv[2]),dst=process.argv[3] ? path.resolve(process.argv[3]) : fs.mkdtempSync(path.join(os.tmpdir(),'qr-format-envelope-'));
console.log(dst);
for(const dir of ['base','instrumented'])fs.mkdirSync(path.join(dst,dir),{recursive:true});
const ts=require(path.join(src,'node_modules/typescript'));
fs.mkdirSync(path.join(dst,'instrumented-src'),{recursive:true});
const sub=(s,a,b)=>{if(s.indexOf(a)<0||s.indexOf(a)!==s.lastIndexOf(a))throw Error('not unique: '+a);return s.replace(a,b)};
for(const dir of ['base','instrumented'])fs.writeFileSync(`${dst}/${dir}/package.json`,'{"type":"module"}');
for(const file of fs.readdirSync(src+'/src').filter(f=>f.endsWith('.ts')))for(const dir of ['base','instrumented']){
 let s=fs.readFileSync(`${src}/src/${file}`,'utf8');
 if(dir==='instrumented'&&file==='decode.ts'){
  s=sub(s,'      const first = locate(image, triple, undefined, work, edges)', '      globalThis.__formatObs.pass(strict, f, inverted)\n      const first = locate(image, triple, undefined, work, edges)');
  s=sub(s,'          budget.maps--\n', '          globalThis.__formatObs.readMap()\n          budget.maps--\n');
 }
 if(dir==='instrumented'&&file==='locate.ts'){
  const sig='export function locate(image: BitImage, triple: readonly [Finder, Finder, Finder], sizeHint?: number, work?: Work, edges: Edges = edgesOf(image)): Location[] {\n';
  s=sub(s,sig,sig+'  globalThis.__formatObs.enter(image)\n');
  s=sub(s,'  if (work) work.scanned += (right - left + 1) * (bottom - top + 1)\n','  globalThis.__formatObs.window((right - left + 1) * (bottom - top + 1))\n  if (work) work.scanned += (right - left + 1) * (bottom - top + 1)\n');
  s=sub(s,'    // Light, dark, light runs through (x, y) going up and down from the dark centre.','    globalThis.__formatObs.vertical()\n    // Light, dark, light runs through (x, y) going up and down from the dark centre.');
  s=sub(s,'      const before = darkStart - start','      globalThis.__formatObs.run()\n      const before = darkStart - start');
  s=sub(s,'  return [...alignments.map((a) => map(a, corner)), ...corners.map((c) => map(undefined, c))]','  const observed = [...alignments.map((a) => map(a, corner)), ...corners.map((c) => map(undefined, c))]\n  globalThis.__formatObs.exit(observed)\n  return observed');
 }
 if(dir==='instrumented')fs.writeFileSync(`${dst}/instrumented-src/${file}`,s);
 fs.writeFileSync(`${dst}/${dir}/${file.replace(/\.ts$/,'.js')}`,ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
for(const file of ['png.ts','photo.ts'])fs.writeFileSync(`${dst}/${file.replace('.ts','.js')}`,ts.transpileModule(fs.readFileSync(`${src}/test/${file}`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
fs.writeFileSync(dst+'/package.json','{"type":"module"}');
