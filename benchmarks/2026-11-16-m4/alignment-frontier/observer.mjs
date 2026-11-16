const hist=(h,k)=>h[k]=(h[k]||0)+1
const equal=(a,b)=>Object.is(a.x,b.x)&&Object.is(a.y,b.y)&&Object.is(a.count,b.count)
export function observer(){
 const stats={windows:0,verticalQueries:0,verticalRejected:0,observations:0,merges:0,creates:0,historyLength:{},activeLength:{},maxHistory:0,maxActive:0,baselineComparisons:0,baselineX:0,baselineY:0,activeComparisons:0,activeX:0,activeY:0,maintenancePasses:0,expirationTests:0,expirationDistanceTests:0,retirements:0,compactions:0,compactionRetainedMoves:0,retiredVerificationTests:0,scoredComparisons:0,scoredX:0,scoredY:0,scoredDistance:0,scoredDuplicates:0,cumulativeActiveIdBytes:0,peakActiveIdBytes:0,peakHistoryFlagBytes:0,peakCombinedMetadataBytes:0}
 const matches=(f,x,y,r)=>Math.abs(f.x-x)<=r&&Math.abs(f.y-y)<=r
 return {
  window(tall,radius){stats.windows++;return {tall,radius,shadow:[],active:[],retired:[],lastRow:null,expected:null}},
  vertical(t,cy){stats.verticalQueries++;if(Number.isNaN(cy))stats.verticalRejected++},
  observe(t,found,y,cx,cy){
   stats.observations++;if(!Number.isFinite(t.tall)||!(t.tall>0))throw Error('accepted nonpositive/nonfinite tall');
   const lower=y-Math.ceil(t.tall);if(!(cy>=lower))throw Error('accepted centre below conservative bound');
   if(found.length!==t.shadow.length)throw Error('shadow history length mismatch');
   hist(stats.historyLength,found.length);stats.maxHistory=Math.max(stats.maxHistory,found.length);
   if(t.lastRow!==y){
    if(t.lastRow!==null&&y<t.lastRow)throw Error('row order decreased');t.lastRow=y;stats.maintenancePasses++;
    let kept=[],retiredNow=0;for(const i of t.active){stats.expirationTests++;const f=t.shadow[i];let expire=false;if(f.y<lower){stats.expirationDistanceTests++;expire=Math.abs(f.y-lower)>t.radius}if(expire){retiredNow++;stats.retirements++;t.retired.push(i)}else{if(retiredNow)stats.compactionRetainedMoves++;kept.push(i)}}
    if(retiredNow)stats.compactions++;t.active=kept;
   }
   for(const i of t.retired){stats.retiredVerificationTests++;if(matches(t.shadow[i],cx,cy,t.radius))throw Error('retired centre would match')}
   hist(stats.activeLength,t.active.length);stats.maxActive=Math.max(stats.maxActive,t.active.length);
   let predicted=-1;for(const i of t.active){const f=t.shadow[i];stats.activeComparisons++;stats.activeX++;if(Math.abs(f.x-cx)<=t.radius){stats.activeY++;if(Math.abs(f.y-cy)<=t.radius){predicted=i;break}}}
   t.expected=predicted;return predicted
  },
  compare(t,f,cx,cy){stats.baselineComparisons++;stats.baselineX++;if(!(Math.abs(f.x-cx)<=t.radius))return false;stats.baselineY++;return Math.abs(f.y-cy)<=t.radius},
  commit(t,found,same,cx,cy,predicted){
   const actual=same===undefined?-1:found.indexOf(same);if(actual!==predicted||predicted!==t.expected)throw Error('earliest match differs');
   if(actual<0){stats.creates++;t.shadow.push({x:cx,y:cy,count:1});t.active.push(t.shadow.length-1);stats.cumulativeActiveIdBytes+=4}
   else{stats.merges++;const f=t.shadow[actual],n=f.count+1;f.x=(f.x*f.count+cx)/n;f.y=(f.y*f.count+cy)/n;f.count++}
   if(found.length!==t.shadow.length)throw Error('history length mismatch after merge');
   for(let i=0;i<found.length;i++)if(!equal(found[i],t.shadow[i]))throw Error('weighted update or ordering mismatch');
   stats.maxHistory=Math.max(stats.maxHistory,found.length);stats.maxActive=Math.max(stats.maxActive,t.active.length);stats.peakActiveIdBytes=Math.max(stats.peakActiveIdBytes,t.active.length*4);stats.peakHistoryFlagBytes=Math.max(stats.peakHistoryFlagBytes,found.length);stats.peakCombinedMetadataBytes=Math.max(stats.peakCombinedMetadataBytes,t.active.length*4+found.length)
  },
  end(t,found){if(found.length!==t.shadow.length)throw Error('final history mismatch');for(let i=0;i<found.length;i++)if(!equal(found[i],t.shadow[i]))throw Error('final history differs')},
  scored(a,p,radius,distance){stats.scoredComparisons++;stats.scoredX++;if(!(Math.abs(a.p.x-p.x)<=radius))return false;stats.scoredY++;if(!(Math.abs(a.p.y-p.y)<=radius))return false;stats.scoredDistance++;const same=distance(a.p,p)<=radius;if(same)stats.scoredDuplicates++;return same},
  report(){return {...stats,comparisonsRemoved:stats.baselineComparisons-stats.activeComparisons,estimatedPeakMetadataBytes:stats.peakCombinedMetadataBytes}}
 }
}
