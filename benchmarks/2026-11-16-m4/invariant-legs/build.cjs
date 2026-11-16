const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
if(!process.argv[2]||!process.argv[3])throw Error('Usage: node build.cjs <repo-root> <output-directory>');
const root=path.resolve(process.argv[2]),dst=path.resolve(process.argv[3]),rev='104b731868c82d00b6f31a9a853db786b2fd971a',ts=require(path.join(root,'node_modules/typescript'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
for(const d of ['base','instrumented','snapshot/src','snapshot/test'])fs.mkdirSync(path.join(dst,d),{recursive:true});
for(const name of git('ls-tree','-r','--name-only',rev,'src','test/photo.ts','test/png.ts').trim().split('\n')){const out=path.join(dst,'snapshot',name);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,git('show',`${rev}:${name}`));}
for(const name of ['noise','gradient','finder-tiles','bent-version-4','bent-version-12','close-up-format-damaged','inverted-flat-blocks-mirrored']){const f=`vectors/conformance/${name}.png`,out=path.join(dst,'snapshot',f);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,execFileSync('git',['show',`${rev}:${f}`],{cwd:root}));}
const sub=(s,a,b)=>{if(s.indexOf(a)<0||s.indexOf(a)!==s.lastIndexOf(a))throw Error('not unique: '+a);return s.replace(a,b)};
for(const dir of ['base','instrumented'])fs.writeFileSync(path.join(dst,dir,'package.json'),'{"type":"module"}');
for(const file of fs.readdirSync(path.join(dst,'snapshot/src')).filter(f=>f.endsWith('.ts')))for(const dir of ['base','instrumented']){
 let s=fs.readFileSync(path.join(dst,'snapshot/src',file),'utf8');
 if(file==='locate.ts'){
  s=sub(s,'  return found.sort((a, b) => b.count - a.count)','  const sorted = found.sort((a, b) => b.count - a.count)\n  globalThis.__finderOutput(sorted)\n  return sorted');
  if(dir==='instrumented'){
   s=sub(s,'function blackWhiteBlack(image: BitImage, from: Point, to: Point): number {', 'function blackWhiteBlack(image: BitImage, from: Point, to: Point): number {\n  return globalThis.__legs.ray(image, from, to, () => blackWhiteBlackOriginal(image, from, to))\n}\n\nfunction blackWhiteBlackOriginal(image: BitImage, from: Point, to: Point): number {');
   s=sub(s,'  const run = (sx: number, sy: number, tx: number, ty: number): number => {\n    const steep', '  const run = (sx: number, sy: number, tx: number, ty: number): number => {\n    globalThis.__legs.runStart()\n    let stopReason = \'endpoint\'\n    const steep');
   s=sub(s,'      if (rx < 0 || ry < 0 || rx >= image.width || ry >= image.height) break','      if (rx < 0 || ry < 0 || rx >= image.width || ry >= image.height) { stopReason = \'bounds\'; break }\n      globalThis.__legs.pixel()');
   s=sub(s,'        if (state === 2) return length(x - sx, y - sy)','        if (state === 2) { globalThis.__legs.runEnd(\'transition\', state); return length(x - sx, y - sy) }');
   s=sub(s,'        if (y === ty) break','        if (y === ty) { stopReason = \'yLimit\'; break }');
   s=sub(s,'    return state === 2 ? length(tx + xstep - sx, ty - sy) : NaN','    globalThis.__legs.runEnd(stopReason, state)\n    return state === 2 ? length(tx + xstep - sx, ty - sy) : NaN');
  }
 }
 if(file==='decode.ts' && dir==='instrumented'){
  s=sub(s,'      const first = locate(image, triple, undefined, work, edges)',"      const first = globalThis.__legs.phase(image, triple, 'initial', 0, { inverted, strict, f, tolerance }, () => locate(image, triple, undefined, work, edges))");
  s=sub(s,'first[0]!.size : over(image, triple)',"first[0]!.size : globalThis.__legs.phase(image, triple, 'over', 0, { inverted, strict, f, tolerance }, () => over(image, triple))");
  s=sub(s,'delta === 0 ? first : locate(image, triple, size + delta, work, edges)',"delta === 0 ? first : globalThis.__legs.phase(image, triple, 'retry', delta, { inverted, strict, f, tolerance }, () => locate(image, triple, size + delta, work, edges))");
 }
 fs.writeFileSync(path.join(dst,dir,file.replace(/\.ts$/,'.js')),ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
for(const file of ['png.ts','photo.ts'])fs.writeFileSync(path.join(dst,file.replace('.ts','.js')),ts.transpileModule(fs.readFileSync(path.join(dst,'snapshot/test',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
fs.writeFileSync(path.join(dst,'package.json'),'{"type":"module"}');console.log(dst);
