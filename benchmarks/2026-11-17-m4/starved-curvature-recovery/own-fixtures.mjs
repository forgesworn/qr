import {framesFor} from './frames-own.mjs'
import {pathToFileURL} from 'node:url'
import {writeFileSync} from 'node:fs'
const [build,out]=process.argv.slice(2),load=p=>import(pathToFileURL(build+'/'+p)),{encode}=await load('base/encode.js'),base=await load('base/decode.js'),candidate=await load('public/decode.js'),rows=[]
for(const f of framesFor(encode)){if(![32,40,41,50,65,74,84].includes(Number(f.meta.id.split('-').at(-1))))continue;const before=base.decode(f.image),work={steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0},after=candidate.decodeCounted(f.image,{},work);if(after&&after.text!==f.text)throw Error('wrong fixture');rows.push({meta:f.meta,before:!!before,after:!!after,work,result:after&&{version:after.version,inverted:after.inverted,mirrored:after.mirrored,location:after.location}})}
writeFileSync(out,JSON.stringify(rows,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(rows))
