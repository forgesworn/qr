export function observer(){
 const edgeGroups=new WeakMap(),groups=[],finders=new WeakMap(),locationMap=new WeakMap(),ids=new WeakMap(),traces=[],success=[],locates=[];
 let currentTriple,passInfo,nextId=1,probes=0,searchComparisons=0,runBoundariesRead=0,fullRows=0;
 const group=(edges,width)=>{let g=edgeGroups.get(edges);if(!g){g={baseline:new Set(),diag:new Map(),width};edgeGroups.set(edges,g);groups.push(g)}return g};
 function probe(image,g,x,y,tolerance,module,ratio){
  probes++;
  if(y<0||y>=image.height||x<0||x>=image.width)return {full:false,partial:false,outside:true};
  let changes=g.diag.get(y);if(!changes){changes=[];const data=image.data,w=image.width,off=y*w;for(let p=1;p<w;p++)if(data[off+p]!==data[off+p-1])changes.push(p);g.diag.set(y,changes);fullRows++}
  if(image.data[y*image.width+x]!==1)return {full:false,partial:false,outside:false};
  let lo=0,hi=changes.length;while(lo<hi){searchComparisons++;const m=(lo+hi)>>1;if(changes[m]<=x)lo=m+1;else hi=m}const idx=lo;
  const boundary=k=>k<=0?0:k>changes.length?image.width:changes[k-1];
  const len=k=>boundary(k+1)-boundary(k);
  const centre=len(idx),slack=module*tolerance;
  const centerOk=Math.abs(3*module-centre)<3*slack;
  let left=false,right=false,full=false;
  if(idx>=2){runBoundariesRead+=4;left=Math.abs(len(idx-1)-module)<slack&&Math.abs(len(idx-2)-module)<slack}
  if(idx+2<=changes.length){runBoundariesRead+=4;right=Math.abs(len(idx+1)-module)<slack&&Math.abs(len(idx+2)-module)<slack}
  if(idx>=2&&idx+2<=changes.length){const counts=[len(idx-2),len(idx-1),centre,len(idx+1),len(idx+2)];runBoundariesRead+=10;full=ratio(counts,tolerance)}
  return {full,partial:centerOk&&(left||right),outside:false};
 }
 const bucket=pair=>pair.filter(x=>x.full).length===2?'both':pair.some(x=>x.full)?'one':'none';
 return {
  baseline(edges,y,width){group(edges,width).baseline.add(y)},
  begin(image,edges,counts,y,end,tolerance,skip,work,ratio){
   const total=counts.reduce((a,b)=>a+b,0),module=total/7,cx=Math.floor(end-counts[4]-counts[3]-counts[2]/2),g=group(edges,image.width);
   const at1=[probe(image,g,cx,y-1,tolerance,module,ratio),probe(image,g,cx,y+1,tolerance,module,ratio)];
   const atSkip=[probe(image,g,cx,y-skip,tolerance,module,ratio),probe(image,g,cx,y+skip,tolerance,module,ratio)];
   const trace={start:work?.steps??0,steps:0,accepted:false,module,skip,at1,atSkip,one:bucket(at1),cadence:bucket(atSkip)};traces.push(trace);return trace;
  },
  finish(trace,work){trace.steps=(work?.steps??0)-trace.start},
  link(trace,finder){trace.accepted=true;let list=finders.get(finder);if(!list){list=[];finders.set(finder,list);ids.set(finder,nextId++)}list.push(trace)},
  pass(strict,scale,inverted){passInfo={strict,scale,inverted}},locate(triple){currentTriple={triple,passInfo,windows:0,scanned:0,runs:0,vertical:0};locates.push(currentTriple)},
  window(area){currentTriple.windows++;currentTriple.scanned+=area},run(){currentTriple.runs++},vertical(){currentTriple.vertical++},
  locations(locations){for(const l of locations)locationMap.set(l,currentTriple)},
  success(location){const origin=locationMap.get(location);if(!origin)throw Error('missing location lineage');const witnesses=origin.triple.map(f=>finders.get(f)??[]);success.push({pass:origin.passInfo,witnesses,ids:origin.triple.map(f=>ids.get(f))})},
  report(){
   const feature=(items,field)=>{const out={both:{count:0,steps:0},one:{count:0,steps:0},none:{count:0,steps:0},nonePartial:{count:0,steps:0},noneOutside:{count:0,steps:0}};for(const t of items){const b=t[field],pair=field==='one'?t.at1:t.atSkip;out[b].count++;out[b].steps+=t.steps;if(b==='none'&&pair.some(p=>p.partial)){out.nonePartial.count++;out.nonePartial.steps+=t.steps}if(b==='none'&&pair.some(p=>p.outside)){out.noneOutside.count++;out.noneOutside.steps+=t.steps}}return out};
   const byModule={};for(const [name,test] of [['lt1',t=>t.module<1],['oneToSkip',t=>t.module>=1&&t.module<t.skip],['atLeastSkip',t=>t.module>=t.skip]]){const rs=traces.filter(test);byModule[name]={count:rs.length,steps:rs.reduce((a,t)=>a+t.steps,0),adjacent:feature(rs,'one'),cadence:feature(rs,'cadence')}}
   const witnesses=success.map(s=>({pass:s.pass,finders:s.witnesses.map((ts,i)=>({id:s.ids[i],sightings:ts.length,adjacent:{both:ts.filter(t=>t.one==='both').length,one:ts.filter(t=>t.one==='one').length,none:ts.filter(t=>t.one==='none').length,partial:ts.filter(t=>t.one==='none'&&t.at1.some(p=>p.partial)).length},cadence:{both:ts.filter(t=>t.cadence==='both').length,one:ts.filter(t=>t.cadence==='one').length,none:ts.filter(t=>t.cadence==='none').length,partial:ts.filter(t=>t.cadence==='none'&&t.atSkip.some(p=>p.partial)).length}}))}));
   let baselineRows=0,diagnosticRows=0,extraRows=0,extraPixels=0,extraRunBoundaries=0;for(const g of groups){baselineRows+=g.baseline.size;diagnosticRows+=g.diag.size;for(const [y,es] of g.diag)if(!g.baseline.has(y)){extraRows++;extraPixels+=g.width;extraRunBoundaries+=es.length}}
   const policy=(partial)=>{const rejected=locates.filter(l=>l.triple.some(f=>{const ts=finders.get(f)??[];return !ts.some(t=>t.one!=='none'||(partial&&t.at1.some(p=>p.partial)))}));return {uniqueTriples:new Set(rejected.map(l=>l.triple.map(f=>ids.get(f)).join(':'))).size,locates:rejected.length,windows:rejected.reduce((a,l)=>a+l.windows,0),scanned:rejected.reduce((a,l)=>a+l.scanned,0),runs:rejected.reduce((a,l)=>a+l.runs,0),vertical:rejected.reduce((a,l)=>a+l.vertical,0)}};
   return {locates:locates.length,triples:new Set(locates.map(l=>l.triple.map(f=>ids.get(f)).join(':'))).size,unsupportedFull:policy(false),unsupportedFullOrPartial:policy(true),candidates:traces.length,acceptedSightings:traces.filter(t=>t.accepted).length,crossSteps:traces.reduce((a,t)=>a+t.steps,0),adjacent:feature(traces,'one'),cadence:feature(traces,'cadence'),byModule,success:witnesses,setup:{probes,searchComparisons,runBoundariesRead,baselineRows,diagnosticRows,extraRows,extraPixels,extraRunBoundaries}};
  }
 }
}
