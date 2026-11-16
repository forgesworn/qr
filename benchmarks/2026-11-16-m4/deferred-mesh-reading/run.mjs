import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'

import {framesFor} from './frames.mjs'
const [root,build,rivals,output]=process.argv.slice(2)
const load=p=>import(pathToFileURL(build+'/'+p)),hash=b=>createHash('sha256').update(b).digest('hex')
const qr=createRequire(rivals+'/package.json')('qrcode')
assert.equal(createRequire(rivals+'/package.json')('qrcode/package.json').version,'1.5.4')
const base=await load('base/decode.js'),observed=await load('observed/decode.js')
const {__qrStageRead}=await load('observed/refine.js'),{readPng}=await load('png.js')
const freshWork=()=>({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
const orientations=[(x,y,n)=>[x,y],(x,y,n)=>[n-x,y],(x,y,n)=>[x,n-y],(x,y,n)=>[n-x,n-y],(x,y,n)=>[y,x],(x,y,n)=>[n-y,x],(x,y,n)=>[y,n-x],(x,y,n)=>[n-y,n-x]]
const stats=a=>{
 if(!a.length)return null
 const s=[...a].sort((x,y)=>x-y),at=p=>s[Math.min(s.length-1,Math.floor(s.length*p))]
 return {count:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,rms:Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length),median:at(.5),p95:at(.95),max:s.at(-1),overHalf:a.filter(x=>x>.5).length,overOne:a.filter(x=>x>1).length}
}
function truth(c,u,v,o){
 const {size,scale,amplitude,sign,axis,profile,rotation}=c
 let [x,y]=orientations[o](u,v,size)
 if(axis==='x')[x,y]=[y,x]
 const t=(x-3.5)/(size-7),shape=profile==='parabola'?4*t*(1-t):Math.sin(2*Math.PI*t),h=sign*amplitude*shape
 y=h+y*(1-h/size)
 if(axis==='x')[x,y]=[y,x]
 x=(x+6)*scale;y=(y+6)*scale
 const side=(size+12)*scale
 for(let r=0;r<rotation;r++)[x,y]=[side-y,x]
 return {x:x/(c.factor??1),y:y/(c.factor??1)}
}
function orientationFor(e,c){
 const indexes=[[3,3],[e.size-4,3],[3,e.size-4]]
 const options=orientations.map((_,o)=>({orientation:o,error:indexes.reduce((sum,[x,y])=>{
  const p=[e.candidate.topLeft,e.candidate.topRight,e.candidate.bottomLeft][indexes.findIndex(p=>p[0]===x&&p[1]===y)],q=truth(c,x+.5,y+.5,o)
  return sum+Math.hypot(p.x-q.x,p.y-q.y)/(c.scale/(c.factor??1))
 },0)/3})).sort((a,b)=>a.error-b.error)
 return {...options[0],alternatives:options}
}
function stageMetrics(e,c,o){
 const n=e.size,errors=[],rowErrors=Array(n).fill(0),colErrors=Array(n).fill(0),bands=Array(16).fill(0)
 let mismatch=0
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x,p=e.points[i],q=truth(c,x+.5,y+.5,o),[u,v]=orientations[o](x+.5,y+.5,n)
  errors.push(Math.hypot(p.x-q.x,p.y-q.y)/(c.scale/(c.factor??1)))
  const expected=c.modules[Math.floor(v)*n+Math.floor(u)]
  if(e.grid[i]!==Number(expected)){mismatch++;rowErrors[y]++;colErrors[x]++;bands[Math.min(3,Math.floor(y*4/n))*4+Math.min(3,Math.floor(x*4/n))]++}
 }
 return {mismatch,fraction:mismatch/(n*n),rowErrors,colErrors,bands4x4:bands,geometryModules:stats(errors)}
}
function analyse(events,fullCase,expected){
 const attempts=[];let current,c=fullCase
 for(const event of events){
  if(event.kind==='start'){
   const factors=[1,2,4,8].filter(f=>Math.floor((fullCase.size+12)*fullCase.scale/f)===event.imageWidth)
   assert.equal(factors.length,1,'Unknown image reduction')
   c={...fullCase,factor:factors[0]}
   current={size:event.size,inverted:event.inverted,mirrored:event.mirrored,ecc:event.ecc,mask:event.mask,strict:event.strict,late:event.late,imageWidth:event.imageWidth,factor:c.factor,candidate:event.candidate,stages:[],walks:[]}
   if(c&&event.size===c.size)current.orientation=orientationFor(event,c)
   attempts.push(current);continue
  }
  assert(current,'Event without start')
  if(event.kind==='nodes'){current.nodesRaw=event;continue}
  if(event.kind.startsWith('walk')){
   const fields=['kind','axis','fixedModule','k','direction','first','last','initialPrior','finalPrior','dark','prior','priorAfter','p','q','ux','uy','seed','a','b','width','offset','accepted','rejection']
   const w=Object.fromEntries(fields.filter(k=>event[k]!==undefined).map(k=>[k,event[k]]))
   if(event.measured)w.measured=Array.from(event.measured)
   if(event.offsets)w.offsets=Array.from(event.offsets)
   if(event.kind==='walk-step'&&c&&event.size===c.size&&current.orientation){
    const x=event.axis==='columns'?event.k:event.fixedModule,y=event.axis==='rows'?event.k:event.fixedModule
    const target=truth(c,x+.5,y+.5,current.orientation.orientation),dx=target.x-event.p.x,dy=target.y-event.p.y
    const den=event.ux*event.ux+event.uy*event.uy
    w.trueOffset=den?(dx*event.ux+dy*event.uy)/den:null
    w.perpendicularError=den?Math.abs(dx*event.uy-dy*event.ux)/Math.sqrt(den)/(c.scale/(c.factor??1)):null
    w.offsetError=event.accepted&&den?event.offset-w.trueOffset:null
   }
   current.walks.push(w);continue
  }
  if(!['mesh','timing','edge'].includes(event.kind))continue
  const failures=[]
  globalThis.__qrSymbolTrace=x=>failures.push(x)
  const decoded=__qrStageRead(event.grid,event.size,event.mirrored,event.ecc,event.mask)
  delete globalThis.__qrSymbolTrace
  const result=decoded.result
  const stage={kind:event.kind,diagnosticSamples:event.diagnosticSamples,gridSha256:hash(event.grid),strictRead:decoded.accepted,matchingHeader:decoded.matchingHeader,strictFormat:decoded.strictFormat,decoded:!!result,textMatches:result?result.text===expected:null,failure:failures}
  if(event.kind==='timing')Object.assign(stage,{cols:Array.from(event.cols),rows:Array.from(event.rows),columnOffsets:stats(Array.from(event.cols,Math.abs)),rowOffsets:stats(Array.from(event.rows,Math.abs))})
  if(c&&event.size===c.size){
   assert(current.orientation)
   Object.assign(stage,stageMetrics(event,c,current.orientation.orientation))
  }
  current.stages.push(stage)
 }
 for(const attempt of attempts){
  c={...fullCase,factor:attempt.factor}
  const e=attempt.nodesRaw;delete attempt.nodesRaw
  if(!e)continue
  attempt.nodes={found:e.found,meshUsable:e.meshUsable,state:Array.from(e.state)}
  if(c&&attempt.size===c.size&&attempt.orientation){
   const o=attempt.orientation.orientation,n=e.c.length,rows=[]
   for(let j=0;j<e.c.length;j++)for(let i=0;i<e.c.length;i++){
    const k=j*n+i,q=truth(c,e.c[i]+.5,e.c[j]+.5,o),a=e.originalPoints[k],b=e.bentPoints[k]
    rows.push({x:e.c[i],y:e.c[j],state:e.state[k],dx:e.ox[k],dy:e.oy[k],originalError:Math.hypot(a.x-q.x,a.y-q.y)/(c.scale/(c.factor??1)),bentError:Math.hypot(b.x-q.x,b.y-q.y)/(c.scale/(c.factor??1))})
   }
   attempt.nodes.positions=rows;attempt.nodes.acceptedErrors=stats(rows.filter(x=>x.state===2).map(x=>x.bentError))
  }
 }
 return attempts
}
const prior=JSON.parse(readFileSync(root+'/benchmarks/2026-11-16-m4/mesh-boundary-continuation/production-fresh.json'))
const frozen=JSON.parse(readFileSync(root+'/benchmarks/2026-11-16-m4/mesh-boundary-continuation/fresh-manifest.json'))
const frames=framesFor(rivals)
assert.deepEqual(frames.map(f=>f.meta),frozen.cases,'Frozen frame identity')
const selected=prior.rows.filter(r=>r.readers.zxing.status==='correct'||r.readers.candidate.status==='correct')
assert.equal(selected.length,42)
const rows=[]
for(const previous of selected){
 const f=frames.find(x=>x.meta.id===previous.id),pixels=hash(f.image.data),a=freshWork(),b=freshWork(),events=[]
 const baseline=base.decodeCounted(f.image,{},a)
 assert.equal(hash(f.image.data),pixels)
 globalThis.__qrTrace=e=>events.push(e)
 let result
 try{result=observed.decodeCounted(f.image,{},b)}finally{delete globalThis.__qrTrace}
 assert.deepEqual(result,baseline,'Observer changed result '+previous.id)
 assert.deepEqual(a,b,'Observer changed Work '+previous.id)
 assert.equal(hash(f.image.data),pixels)
 assert.equal(!!result,previous.readers.candidate.status==='correct','Released result changed')
 if(result){assert.equal(result.text,f.text);assert(Buffer.from(result.bytes).equals(Buffer.from(f.text)))}
 const c={...f.meta,size:f.size,modules:f.modules},attempts=analyse(events,c,f.text)
 rows.push({...f.meta,read:!!result,work:a,observerPreserved:true,attempts})
 console.log(JSON.stringify({id:previous.id,read:!!result,attempts:attempts.map(a=>({size:a.size,anchorError:a.orientation?.error,found:a.nodes?.found,stages:a.stages.map(s=>({kind:s.kind,mismatch:s.mismatch,geometry:s.geometryModules?.median,read:s.strictRead}))}))}))
}
writeFileSync(output,JSON.stringify({passed:true,encoder:'qrcode@1.5.4',identity:JSON.parse(readFileSync(build+'/identity.json')),runnerSha256:hash(readFileSync(new URL(import.meta.url))),framesSha256:hash(readFileSync(new URL('./frames.mjs',import.meta.url))),rows},null,2)+'\n',{flag:'wx'})
