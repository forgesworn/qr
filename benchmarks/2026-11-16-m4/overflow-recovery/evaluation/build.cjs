const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process')
const [repoArg,candidateArg,dstArg]=process.argv.slice(2)
if(!repoArg||!candidateArg||!dstArg||process.argv.length!==5)throw Error('Usage: node build.cjs <repo-root> <candidate-source-dir> <new-generated-dir>')
const root=path.resolve(repoArg),candidate=path.resolve(candidateArg),dst=path.resolve(dstArg),rev='c6f05a9808df82365e5999aa5f00951093558a43'
const ts=require(path.join(root,'node_modules/typescript')),sha=x=>crypto.createHash('sha256').update(x).digest('hex')
const hashes={'locate.ts':'d911b106051eb4a4cd7200c42634c18c9b2077e0ebfda12a06be5f3c7f3ec824','decode.ts':'491e43c7cff8ccc5058b77341c7ed074ea2d0453958ac40390e2b1fd9307c02b'}
for(const [f,h] of Object.entries(hashes))if(sha(fs.readFileSync(path.join(candidate,f)))!==h)throw Error('candidate source hash '+f)
fs.mkdirSync(dst)
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'})
const names=git('ls-tree','-r','--name-only',rev,'src').trim().split('\n').filter(n=>n.endsWith('.ts'))
const sourceSha256={base:{},candidate:{}}
for(const dir of ['base','candidate']){
 fs.mkdirSync(path.join(dst,dir));fs.writeFileSync(path.join(dst,dir,'package.json'),'{"type":"module"}')
 for(const name of names){const f=path.basename(name);let src=git('show',`${rev}:${name}`);if(dir==='candidate'&&hashes[f])src=fs.readFileSync(path.join(candidate,f),'utf8');sourceSha256[dir][f]=sha(src)
 fs.writeFileSync(path.join(dst,dir,f.replace(/\.ts$/,'.js')),ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)}
}
fs.mkdirSync(path.join(dst,'fixture'));fs.writeFileSync(path.join(dst,'package.json'),'{"type":"module"}')
const fixtureFiles={'comparison-fixtures.mjs':'scripts/comparison-fixtures.mjs','photos.json':'vectors/photos.json','generate.mjs':'benchmarks/2026-11-16-m4/fresh-stress-unevaluated/generate.mjs','photo.mjs':'benchmarks/2026-11-16-m4/fresh-stress-unevaluated/photo.mjs','photo.ts':'benchmarks/2026-11-16-m4/fresh-stress-unevaluated/photo.ts','manifest.json':'benchmarks/2026-11-16-m4/fresh-stress-unevaluated/manifest.json','png.ts':'test/png.ts'}
const fixtureSha256={};for(const [dest,src] of Object.entries(fixtureFiles)){const text=git('show',`${rev}:${src}`);fixtureSha256[dest]=sha(text);fs.writeFileSync(path.join(dst,'fixture',dest),text)}
const png=fs.readFileSync(path.join(dst,'fixture/png.ts'),'utf8');fs.writeFileSync(path.join(dst,'fixture/png.js'),ts.transpileModule(png,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)
const dirHash=d=>{const h=crypto.createHash('sha256');for(const f of fs.readdirSync(path.join(dst,d)).filter(x=>x.endsWith('.js')).sort())h.update(f).update(fs.readFileSync(path.join(dst,d,f)));return h.digest('hex')}
const identity={revision:rev,sourceSha256,jsSha256:{base:dirHash('base'),candidate:dirHash('candidate')},fixtureSha256,typescriptVersion:ts.version,builderSha256:sha(fs.readFileSync(__filename))}
fs.writeFileSync(path.join(dst,'identity.json'),JSON.stringify(identity,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(identity))
