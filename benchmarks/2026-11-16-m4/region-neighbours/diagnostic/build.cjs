const fs=require('fs'),path=require('path'),os=require('os'),{execFileSync}=require('child_process');
if(!process.argv[2]) throw Error('Usage: node build.cjs <repo-root> [output-dir]');
const root=path.resolve(process.argv[2]),dst=process.argv[3]?path.resolve(process.argv[3]):fs.mkdtempSync(path.join(os.tmpdir(),'qr-region-annotation-'));
const src=path.join(dst,'snapshot'),revision='cbc54dbb07e0864fc5b3796a9e0b2e1830d87ba3';
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
const ts=require(path.join(root,'node_modules/typescript'));
for(const dir of ['base','instrumented','snapshot/src','snapshot/test'])fs.mkdirSync(path.join(dst,dir),{recursive:true});
const files=git('ls-tree','-r','--name-only',revision,'src','test/photo.ts','test/png.ts').trim().split('\n').filter(Boolean);
for(const name of files){const out=path.join(src,name);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,git('show',`${revision}:${name}`))}
console.log(dst);
const sub=(s,a,b)=>{if(s.indexOf(a)<0||s.indexOf(a)!==s.lastIndexOf(a))throw Error('not unique '+a);return s.replace(a,b)};
for(const dir of ['base','instrumented'])fs.writeFileSync(`${dst}/${dir}/package.json`,'{"type":"module"}');
for(const file of fs.readdirSync(src+'/src').filter(f=>f.endsWith('.ts')))for(const dir of ['base','instrumented']){
 let s=fs.readFileSync(`${src}/src/${file}`,'utf8');
 if(dir==='instrumented'&&file==='decode.ts'){
  s=sub(s,'      const first = locate(image, triple, undefined, work, edges)', '      globalThis.__region.pass(strict, f, inverted)\n      const first = locate(image, triple, undefined, work, edges)');
  s=sub(s,'          if (result) return result','          if (result) { globalThis.__region.success(location); return result }');
  s=sub(s,'    if (result) return { ...result, mirrored: candidate.mirrored, inverted: candidate.inverted, location: where(candidate.location, f) }','    if (result) { globalThis.__region.success(candidate.location); return { ...result, mirrored: candidate.mirrored, inverted: candidate.inverted, location: where(candidate.location, f) } }');
 }
 if(dir==='instrumented'&&file==='locate.ts'){
  s=sub(s,'  const consider = (counts: readonly number[], y: number, end: number) => {','  const consider = (counts: readonly number[], y: number, end: number) => {\n    const trace = globalThis.__region.begin(image, edges, [...counts], y, end, tolerance, skip, work, finderRatio)\n    try {');
  s=sub(s,'      return true\n    }\n    found.push({ x: cx, y: cy, moduleSize, count: 1 })\n    file(found.length - 1)\n    return true\n  }','      globalThis.__region.link(trace, f)\n      return true\n    }\n    found.push({ x: cx, y: cy, moduleSize, count: 1 })\n    file(found.length - 1)\n    globalThis.__region.link(trace, found[found.length - 1])\n    return true\n    } finally { globalThis.__region.finish(trace, work) }\n  }');
  s=sub(s,'  for (let y = skip - 1; y < height; y += skip) {\n    const changes = edges.row(y)','  for (let y = skip - 1; y < height; y += skip) {\n    globalThis.__region.baseline(edges, y, width)\n    const changes = edges.row(y)');
  const sig='export function locate(image: BitImage, triple: readonly [Finder, Finder, Finder], sizeHint?: number, work?: Work, edges: Edges = edgesOf(image)): Location[] {\n';
  s=sub(s,sig,sig+'  globalThis.__region.locate(triple)\n');
  s=sub(s,'  if (work) work.scanned += (right - left + 1) * (bottom - top + 1)\n','  globalThis.__region.window((right - left + 1) * (bottom - top + 1))\n  if (work) work.scanned += (right - left + 1) * (bottom - top + 1)\n');
  s=sub(s,'    // Light, dark, light runs through (x, y) going up and down from the dark centre.','    globalThis.__region.vertical()\n    // Light, dark, light runs through (x, y) going up and down from the dark centre.');
  s=sub(s,'      const before = darkStart - start','      globalThis.__region.run()\n      const before = darkStart - start');
  s=sub(s,'  return [...alignments.map((a) => map(a, corner)), ...corners.map((c) => map(undefined, c))]','  const observed = [...alignments.map((a) => map(a, corner)), ...corners.map((c) => map(undefined, c))]\n  globalThis.__region.locations(observed)\n  return observed');
 }
 fs.writeFileSync(`${dst}/${dir}/${file.replace(/\.ts$/,'.js')}`,ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
for(const file of ['png.ts','photo.ts'])fs.writeFileSync(`${dst}/${file.replace('.ts','.js')}`,ts.transpileModule(fs.readFileSync(`${src}/test/${file}`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
fs.writeFileSync(dst+'/package.json','{"type":"module"}');
