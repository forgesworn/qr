const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process')
const [root,out]=process.argv.slice(2)
if(!root||!out)throw Error('Usage: build-production.cjs <repo> <new-output>')
const revision='b1cf94d31c196ce996c7eb723cb37aa4575af660',git=(...a)=>execFileSync('git',['-C',root,...a],{encoding:'utf8'}),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),ts=require(path.join(root,'node_modules/typescript'))
const expectedCandidate={"decode.ts": "5e2842a735754130fc32339d309f22deee7244077e9903f41810f16f7c674d0b", "refine.ts": "d966fa2f6e864f9a90fc4b91186cfbaf66942f6ca95bd076c8cb40720ecc7b1c", "symbol.ts": "18288c0bccc74a6e4ff82293051d70835420e8aa6233bb34c6d567ba047a68d1"}
for(const [file,expected]of Object.entries(expectedCandidate))if(sha(fs.readFileSync(path.join(root,'src',file)))!==expected)throw Error('Candidate source identity: '+file)
const changed=Object.keys(expectedCandidate),sources={},generated={}
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'package.json'),'{"type":"module"}')
for(const variant of ['base','public']){
 fs.mkdirSync(path.join(out,variant));sources[variant]={};generated[variant]={}
 for(const name of git('ls-tree','-r','--name-only',revision,'src').trim().split('\n').filter(n=>n.endsWith('.ts'))){
  const file=path.basename(name),text=variant==='public'&&changed.includes(file)?fs.readFileSync(path.join(root,name),'utf8'):git('show',revision+':'+name)
  sources[variant][file]=sha(text)
  const js=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
  fs.writeFileSync(path.join(out,variant,file.replace(/\.ts$/,'.js')),js);generated[variant][file]=sha(js)
 }
}
const png=git('show',revision+':test/png.ts');fs.writeFileSync(path.join(out,'png.js'),ts.transpileModule(png,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)
fs.writeFileSync(path.join(out,'identity.json'),JSON.stringify({revision,compiler:ts.version,sources,generated,builderSha256:sha(fs.readFileSync(__filename))},null,2)+'\n')
