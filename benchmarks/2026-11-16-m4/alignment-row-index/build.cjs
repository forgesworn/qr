const fs=require('fs'),path=require('path'),os=require('os'),{execFileSync}=require('child_process');
if(!process.argv[2]) throw Error('Usage: node build.cjs <repo> [out]');
const root=path.resolve(process.argv[2]),dst=process.argv[3]?path.resolve(process.argv[3]):fs.mkdtempSync(path.join(os.tmpdir(),'qr-alignment-row-index-')),rev='497d12a91742899fe8ed2801c81bd720398cb94c',ts=require(path.join(root,'node_modules/typescript'));
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'});for(const dir of ['base','instrumented','snapshot/src','snapshot/test'])fs.mkdirSync(path.join(dst,dir),{recursive:true});
for(const name of git('ls-tree','-r','--name-only',rev,'src','test/photo.ts','test/png.ts').trim().split('\n')){let out=path.join(dst,'snapshot',name);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,git('show',`${rev}:${name}`))}
const sub=(s,a,b)=>{if(s.indexOf(a)<0||s.indexOf(a)!==s.lastIndexOf(a))throw Error('not unique '+a);return s.replace(a,b)};
for(const dir of ['base','instrumented'])fs.writeFileSync(`${dst}/${dir}/package.json`,'{"type":"module"}');
for(const file of fs.readdirSync(dst+'/snapshot/src').filter(f=>f.endsWith('.ts')))for(const dir of ['base','instrumented']){let s=fs.readFileSync(`${dst}/snapshot/src/${file}`,'utf8');if(dir==='instrumented'&&file==='locate.ts'){
 s=sub(s,'export function locate(image: BitImage, triple: readonly [Finder, Finder, Finder], sizeHint?: number, work?: Work, edges: Edges = edgesOf(image)): Location[] {', 'export function locate(image: BitImage, triple: readonly [Finder, Finder, Finder], sizeHint?: number, work?: Work, edges: Edges = edgesOf(image)): Location[] {\n  globalThis.__alignment.locate(image, triple)');
 s=sub(s,'    const n = changes.length\n    // The first change of colour past the window\'s left edge.','    const n = changes.length\n    globalThis.__alignment.query(image, y, left, right, wide, changes)\n    // The first change of colour past the window\'s left edge.');
 s=sub(s,'      const after = end - darkEnd\n      if (Math.abs(before - wide)', '      const after = end - darkEnd\n      globalThis.__alignment.visit(image, y, left, right, wide, changes, k, start, darkStart, darkEnd, end)\n      if (Math.abs(before - wide)');
}fs.writeFileSync(`${dst}/${dir}/${file.replace(/\.ts$/,'.js')}`,ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)}
for(const file of ['png.ts','photo.ts'])fs.writeFileSync(`${dst}/${file.replace('.ts','.js')}`,ts.transpileModule(fs.readFileSync(`${dst}/snapshot/test/${file}`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
fs.writeFileSync(dst+'/package.json','{"type":"module"}');console.log(dst);
