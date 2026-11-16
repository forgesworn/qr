const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process')
const [root,observed,out,baselineSource=root]=process.argv.slice(2),sha=x=>crypto.createHash('sha256').update(x).digest('hex')
const ts=require(path.join(root,'node_modules/typescript')),revision=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim()
if(revision!=='b74fa2ff397369a247d70976cfd8ad5b7619588e')throw Error('Unexpected baseline')
if(execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Dirty baseline')
fs.mkdirSync(out);fs.writeFileSync(path.join(out,'package.json'),'{"type":"module"}')
const sources={},generated={}
for(const [name,src]of [['base',baselineSource],['observed',observed]]){
 fs.mkdirSync(path.join(out,name));sources[name]={};generated[name]={}
 for(const file of fs.readdirSync(path.join(src,'src')).filter(x=>x.endsWith('.ts'))){
  const source=fs.readFileSync(path.join(src,'src',file),'utf8')
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
  sources[name][file]=sha(source);generated[name][file]=sha(js)
  fs.writeFileSync(path.join(out,name,file.replace(/\.ts$/,'.js')),js)
 }
}
const png=fs.readFileSync(path.join(root,'test/png.ts'),'utf8')
fs.writeFileSync(path.join(out,'png.js'),ts.transpileModule(png,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)
fs.writeFileSync(path.join(out,'identity.json'),JSON.stringify({revision,compiler:ts.version,sources,generated,builderSha256:sha(fs.readFileSync(__filename))},null,2)+'\n')
