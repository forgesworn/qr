const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict')
assert.equal(process.argv.length,4,'Usage: build-audit.cjs ROOT AUDIT_DIR')
const [root,out]=process.argv.slice(2).map(p=>path.resolve(p)),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),identity=JSON.parse(fs.readFileSync(out+'/source-identity.json'))
assert(!fs.existsSync(out+'/public'));assert(!fs.existsSync(out+'/identity.json'))
const names=Object.keys(identity.sourceHashes).sort();assert.deepEqual(fs.readdirSync(out+'/src').filter(n=>n.endsWith('.ts')).sort(),names)
for(const n of names){assert.equal(sha(fs.readFileSync(root+'/src/'+n)),identity.sourceHashes[n]);assert.equal(sha(fs.readFileSync(out+'/src/'+n)),identity.observerSourceHashes[n])}
const ts=require(root+'/node_modules/typescript'),host={getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=> '\n'},check=(items,label)=>{if(items.length){process.stderr.write(ts.formatDiagnosticsWithColorAndContext(items,host));throw Error(label)}}
const config=ts.readConfigFile(root+'/tsconfig.json',ts.sys.readFile);check(config.error?[config.error]:[],'config')
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);check(parsed.errors,'parse')
const options={...parsed.options,rootDir:out+'/src',outDir:out+'/public',noEmit:true},files=names.map(n=>out+'/src/'+n)
check(ts.getPreEmitDiagnostics(ts.createProgram(files,options)),'Observer typecheck')
const emitted=ts.createProgram(files,{...options,noEmit:false}).emit();check(emitted.diagnostics,'Observer emit');assert(!emitted.emitSkipped)
fs.writeFileSync(out+'/identity.json',JSON.stringify({...identity,typechecked:true,compiler:ts.version,generated:Object.fromEntries(names.map(n=>[n,sha(fs.readFileSync(out+'/public/'+n.replace(/\.ts$/,'.js')))])),builderSha256:sha(fs.readFileSync(__filename)),tsconfigSha256:sha(fs.readFileSync(root+'/tsconfig.json'))},null,2)+'\n',{flag:'wx'})
console.log('Timing observer copied-source typecheck/build complete')
