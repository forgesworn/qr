const fs=require('fs'),path=require('path'),crypto=require('crypto')
const [root,source,out]=process.argv.slice(2),ts=require(path.join(root,'node_modules/typescript'))
const sha=x=>crypto.createHash('sha256').update(x).digest('hex')
fs.mkdirSync(out);fs.mkdirSync(out+'/public');fs.writeFileSync(out+'/package.json','{"type":"module"}')
const identity=JSON.parse(fs.readFileSync(source+'/identity.json')),generated={}
for(const file of fs.readdirSync(source).filter(n=>n.endsWith('.ts')).sort()){
 const input=fs.readFileSync(source+'/'+file,'utf8'),result=ts.transpileModule(input,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},reportDiagnostics:true})
 if(result.diagnostics?.length)throw Error(ts.formatDiagnosticsWithColorAndContext(result.diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}))
 generated[file]=sha(result.outputText);fs.writeFileSync(out+'/public/'+file.replace(/\.ts$/,'.js'),result.outputText)
}
fs.writeFileSync(out+'/identity.json',JSON.stringify({instrument:identity,compiler:ts.version,generated,builderSha256:sha(fs.readFileSync(__filename))},null,2)+'\n')
console.log('Built source-only observer '+Object.keys(generated).length+' modules')
