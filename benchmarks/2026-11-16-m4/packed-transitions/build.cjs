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
   s=sub(s,'  const scratch = new Int32Array(width)\n  const words = new DataView', '  const scratch = new Int32Array(width)\n  globalThis.__packed.cache(rows, height)\n  const words = new DataView');
   s=sub(s,'      let edges = rows[y]\n      if (edges === undefined) {','      let edges = rows[y]\n      globalThis.__packed.rowCall(edges === undefined)\n      if (edges === undefined) {');
   s=sub(s,'        edges = scratch.slice(0, n)\n        rows[y] = edges','        edges = scratch.slice(0, n)\n        globalThis.__packed.construct(rows, width, edges)\n        rows[y] = edges');
   s=sub(s,'    const changes = edges.row(y)\n    // Each eligible window','    const changes = edges.row(y)\n    globalThis.__packed.finderRow(changes, width, data[y * width] === 1)\n    // Each eligible window');
   s=sub(s,'    while (k <= changes.length) {\n      const start = k - 4','    while (k <= changes.length) {\n      globalThis.__packed.finderWindow(changes, k)\n      const start = k - 4');
   s=sub(s,'      k += finderRatio(counts, tolerance) && consider(counts, y, end) ? 6 : 2\n    }\n  }','      k += finderRatio(counts, tolerance) && consider(counts, y, end) ? 6 : 2\n    }\n    globalThis.__packed.finderEnd(k)\n  }');
   s=sub(s,'    const n = changes.length\n    // The first change of colour past the window\'s left edge.','    const n = changes.length\n    globalThis.__packed.alignmentRow(changes, left, right, width, data[y * width + left] === 1)\n    // The first change of colour past the window\'s left edge.');
   s=sub(s,'      const after = end - darkEnd\n      if (Math.abs(before - wide)', '      const after = end - darkEnd\n      globalThis.__packed.alignmentItem(before, middle, after)\n      if (Math.abs(before - wide)');
   s=sub(s,'      start = darkEnd\n      k += 2\n    }\n  }\n  // A candidate seen on one row only counts as three modules further away.', '      start = darkEnd\n      k += 2\n    }\n    globalThis.__packed.alignmentEnd()\n  }\n  // A candidate seen on one row only counts as three modules further away.');
  }
 }
 fs.writeFileSync(path.join(dst,dir,file.replace(/\.ts$/,'.js')),ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
for(const file of ['png.ts','photo.ts'])fs.writeFileSync(path.join(dst,file.replace('.ts','.js')),ts.transpileModule(fs.readFileSync(path.join(dst,'snapshot/test',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
fs.writeFileSync(path.join(dst,'package.json'),'{"type":"module"}');console.log(dst);
