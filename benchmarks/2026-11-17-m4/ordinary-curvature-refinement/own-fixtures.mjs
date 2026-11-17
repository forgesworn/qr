import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const [root,build,fixture,out]=process.argv.slice(2),ts=createRequire(root+'/package.json')('typescript'),sha=b=>createHash('sha256').update(b).digest('hex')
const source=readFileSync(fixture,'utf8').replace('../src/encode.js','./base/encode.js')
writeFileSync(build+'/own-fixture.js',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText,{flag:'wx'})
const load=p=>import(pathToFileURL(build+'/'+p)),{ordinaryCurvaturePicture}=await load('own-fixture.js'),base=await load('base/decode.js'),candidate=await load('public/decode.js'),rows=[]
for(const index of [73,79,88]){
 const f=ordinaryCurvaturePicture(index),input=sha(f.image.data),before=base.decode(f.image),work={steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0},after=candidate.decodeCounted(f.image,{},work)
 assert.equal(sha(f.image.data),input);if(after){assert.equal(after.text,f.text);assert.deepEqual(after.bytes,new TextEncoder().encode(f.text));for(const key of ['version','ecc','mirrored','inverted'])assert.equal(after[key],f[key])}
 rows.push({index,pixelSha256:input,before:!!before,after:!!after,work})
}
writeFileSync(out,JSON.stringify({fixtureSha256:sha(readFileSync(fixture)),rows},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(rows))
