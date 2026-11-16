const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process')
const [root,out]=process.argv.slice(2)
if(!root||!out)throw Error('Usage: build-production.cjs <repo> <new-output>')
const revision='d6d91b17a0cca31dbb4f6008a4f6b584049ef027',git=(...a)=>execFileSync('git',['-C',root,...a],{encoding:'utf8'}),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),ts=require(path.join(root,'node_modules/typescript'))
const expectedCandidate={"decode.ts":"4bebef665b0255cf6b365a125c49292660247329b03c4b608c4d8a67e7512e15"}
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
