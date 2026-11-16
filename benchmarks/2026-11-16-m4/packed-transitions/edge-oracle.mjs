import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
if(!process.argv[2])throw Error('Usage: node edge-oracle.mjs <generated-dir>')
const root=resolve(process.argv[2]),{edgesOf}=await import(pathToFileURL(join(root,'base/locate.js')).href)
let seed=0x681afb39,cases=0,collapseGroups=0
const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24}
for(let width=1;width<=257;width++)for(let variant=0;variant<12;variant++){
 const offset=variant%7+1,buffer=new Uint8Array(offset+width+11).fill(0xa5),row=buffer.subarray(offset,offset+width)
 for(let x=0;x<width;x++)row[x]=variant<4?(variant===0?0:variant===1?255:variant===2?x%2:Math.floor(x/7)%2):next()
 for(const inverse of [false,true]){
  const bytes=inverse?Uint8Array.from(row,v=>v^1):row
  const image={data:bytes,width,height:1},actual=Array.from(edgesOf(image).row(0)),words=Array(Math.ceil(width/64)).fill(0n),expected=[]
  for(let x=1;x<width;x++)if(bytes[x]!==bytes[x-1]){words[Math.floor(x/64)]|=1n<<BigInt(x%64);expected.push(x)}
  for(let x=1;x+8<=width;x+=8){
   let d=0n,mask=0;for(let i=0;i<8;i++){const v=bytes[x+i]^bytes[x+i-1];d|=BigInt(v)<<BigInt(i*8);if(v!==0)mask|=1<<i}
   d|=d>>4n;d|=d>>2n;d|=d>>1n;d&=0x0101010101010101n
   const packed=Number(((d*0x0102040810204080n)&0xffffffffffffffffn)>>56n)
   assert.equal(packed,mask);collapseGroups++
  }
  assert.equal(words[0]&1n,0n);assert.deepEqual(actual,expected)
  const decoded=[];for(let w=0;w<words.length;w++)for(let bit=0;bit<64;bit++)if((words[w]>>BigInt(bit))&1n)decoded.push(w*64+bit)
  assert.deepEqual(decoded,expected);assert(decoded.every(x=>x<width));cases++
 }
}
function collapse(values){let d=0n,expected=0;for(let i=0;i<8;i++){d|=BigInt(values[i])<<BigInt(i*8);if(values[i])expected|=1<<i}d|=d>>4n;d|=d>>2n;d|=d>>1n;d&=0x0101010101010101n;return [Number(((d*0x0102040810204080n)&0xffffffffffffffffn)>>56n),expected]}
let laneCases=0
for(let mask=0;mask<256;mask++){const v=Array.from({length:8},(_,i)=>(mask&(1<<i))?255:0);const [a,b]=collapse(v);assert.equal(a,b);laneCases++}
for(let lane=0;lane<8;lane++)for(let value=0;value<256;value++){const v=Array(8).fill(0);v[lane]=value;const [a,b]=collapse(v);assert.equal(a,b);laneCases++}
console.log(JSON.stringify({cases,collapseGroups,laneCases,widths:'1..257',arbitraryBytes:true,offsetSlices:true,inversion:'xor 1',oracleSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex')}))
