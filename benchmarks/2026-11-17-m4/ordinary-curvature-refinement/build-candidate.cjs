const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process')
const [root,source,out]=process.argv.slice(2),ts=require(path.join(root,'node_modules/typescript')),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),revision='29c18aa8c63df53ced3d08ed4dbd0fa1f876905d'
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'})
fs.mkdirSync(out);fs.writeFileSync(out+'/package.json','{"type":"module"}')
const sources={},generated={}
for(const variant of ['base','public']){
 fs.mkdirSync(out+'/'+variant);sources[variant]={};generated[variant]={}
 for(const name of git('ls-tree','-r','--name-only',revision,'src').trim().split('\n').filter(x=>x.endsWith('.ts'))){
  const file=path.basename(name),s=variant==='base'?git('show',revision+':'+name):fs.readFileSync(path.join(source,path.basename(name)),'utf8')
  const js=ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
  sources[variant][file]=sha(s);generated[variant][file]=sha(js);fs.writeFileSync(out+'/'+variant+'/'+file.replace(/\.ts$/,'.js'),js)
 }
}
const png=fs.readFileSync(root+'/test/png.ts','utf8')
fs.writeFileSync(out+'/png.js',ts.transpileModule(png,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText)
fs.writeFileSync(out+'/identity.json',JSON.stringify({revision,compiler:ts.version,sources,generated,builderSha256:sha(fs.readFileSync(__filename))},null,2)+'\n')
