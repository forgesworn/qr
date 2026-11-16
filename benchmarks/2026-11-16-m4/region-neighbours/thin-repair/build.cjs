const fs=require('fs'),path=require('path'),os=require('os'),{execFileSync}=require('child_process');
if(!process.argv[2])throw Error('Usage: node build.cjs <repo-root> [output-dir]');
const root=path.resolve(process.argv[2]),dst=process.argv[3]?path.resolve(process.argv[3]):fs.mkdtempSync(path.join(os.tmpdir(),'qr-region-filter-'));
const src=path.join(dst,'snapshot'),revision='8fd581bd89bf0c581f8dde925a680d46da0e27aa',ts=require(path.join(root,'node_modules/typescript'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
for(const dir of ['base','candidate','validation','snapshot/src','snapshot/test'])fs.mkdirSync(path.join(dst,dir),{recursive:true});
for(const name of git('ls-tree','-r','--name-only',revision,'src','test/photo.ts','test/png.ts').trim().split('\n')){const out=path.join(src,name);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,git('show',`${revision}:${name}`))}
const sub=(s,a,b)=>{if(s.indexOf(a)<0||s.indexOf(a)!==s.lastIndexOf(a))throw Error('not unique '+a);return s.replace(a,b)};
for(const dir of ['base','candidate','validation'])fs.writeFileSync(`${dst}/${dir}/package.json`,'{"type":"module"}');
for(const file of fs.readdirSync(src+'/src').filter(f=>f.endsWith('.ts')))for(const dir of ['base','candidate','validation']){
 let s=fs.readFileSync(`${src}/src/${file}`,'utf8');
 if(dir!=='base'&&file==='decode.ts'){
  s="import { hasSupport } from './region-support.js'\n"+s;
  s=sub(s,'finderTriples(image, findFinders(image, tolerance, work, edges)).slice(0, MAX_TRIPLES)','finderTriples(image, findFinders(image, tolerance, work, edges)).filter(triple => triple.every(hasSupport)).slice(0, MAX_TRIPLES)');
 }
 if(dir!=='base'&&file==='locate.ts'){
  s="import { markSupport } from './region-support.js'\n"+s;
  s=sub(s,'    const dy = crossCheck(image, Math.floor(cx), y, 0, 1, maxCount, total, tolerance, work)','    const verticalX = Math.floor(cx)\n    const dy = crossCheck(image, verticalX, y, 0, 1, maxCount, total, tolerance, work)');

  s=sub(s,'      return true\n    }\n    found.push({ x: cx, y: cy, moduleSize, count: 1 })\n    file(found.length - 1)\n    return true\n  }','      markSupport(image, edges, counts, y, end, tolerance, f, finderRatio, verticalX, cy)\n      return true\n    }\n    found.push({ x: cx, y: cy, moduleSize, count: 1 })\n    file(found.length - 1)\n    markSupport(image, edges, counts, y, end, tolerance, found[found.length - 1], finderRatio, verticalX, cy)\n    return true\n  }');
  if(dir==='validation'){
   s="import { findFinders as referenceFinders, edgesOf as referenceEdges } from '../base/locate.js'\n"+s;
   s=sub(s,'    if (work) work.steps += c0 + c1 + c2 + c3 + c4','    if (dx === 0 && dy === 1) globalThis.__verticalCount = c2\n    if (work) work.steps += c0 + c1 + c2 + c3 + c4');
   s=sub(s,'    if (Number.isNaN(dy)) return false\n    const cy = y + dy','    if (Number.isNaN(dy)) return false\n    const originalVertical = globalThis.__verticalCount\n    const cy = y + dy');
   s=sub(s,'    if (Number.isNaN(diagonal)) return false\n    const moduleSize = total / 7',`    if (Number.isNaN(diagonal)) return false
    const py = Math.floor(cy)
    const thin = py > 0 && py + 1 < image.height && image.data[py * image.width + verticalX] === 1 && image.data[(py - 1) * image.width + verticalX] !== 1 && image.data[(py + 1) * image.width + verticalX] !== 1
    if (thin !== (originalVertical === 1)) throw new Error('single-pixel vertical mismatch')
    globalThis.__thinChecks = (globalThis.__thinChecks ?? 0) + 1
    if (thin) globalThis.__thinTrue = (globalThis.__thinTrue ?? 0) + 1
    const moduleSize = total / 7`);

   s=sub(s,'  const { width, height } = image\n  const found: { x: number; y: number; moduleSize: number; count: number }[] = []','  const { width, height } = image\n  const initialSteps = work?.steps ?? 0\n  const initialCompared = work?.compared ?? 0\n  const found: { x: number; y: number; moduleSize: number; count: number }[] = []');
   s=sub(s,'  return found.sort((a, b) => b.count - a.count)\n}',`  const actual = found.sort((a, b) => b.count - a.count)
  const shadow = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0 }
  const expected = referenceFinders(image, tolerance, shadow, referenceEdges(image))
  if (JSON.stringify(actual) !== JSON.stringify(expected) || (work && (work.steps - initialSteps !== shadow.steps || work.compared - initialCompared !== shadow.compared))) throw new Error('finder shadow mismatch')
  globalThis.__finderChecks = (globalThis.__finderChecks ?? 0) + 1
  return actual
}`);
  }
 }
 fs.writeFileSync(`${dst}/${dir}/${file.replace(/\.ts$/,'.js')}`,ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
const support=fs.readFileSync(path.join(__dirname,'region-support.js'),'utf8');
fs.writeFileSync(path.join(dst,'candidate','region-support.js'),support);
const measured=support.replace('  if (supported.get(finder) === true) return', '  globalThis.__supportCalls = (globalThis.__supportCalls ?? 0) + 1\n  if (supported.get(finder) === true) { globalThis.__supportShort = (globalThis.__supportShort ?? 0) + 1; return }').replace('  const probe = row => {','  const probe = row => {\n    globalThis.__supportProbes = (globalThis.__supportProbes ?? 0) + 1');
fs.writeFileSync(path.join(dst,'validation','region-support.js'),measured);
for(const file of ['png.ts','photo.ts'])fs.writeFileSync(`${dst}/${file.replace('.ts','.js')}`,ts.transpileModule(fs.readFileSync(`${src}/test/${file}`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
fs.writeFileSync(dst+'/package.json','{"type":"module"}');console.log(dst);
