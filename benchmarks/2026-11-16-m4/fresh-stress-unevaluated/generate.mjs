import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { frame, photograph } from './photo.mjs'

const rivals = process.env.QR_RIVALS
if (!rivals) throw new Error('Set QR_RIVALS to the directory containing qrcode 1.5.4')
const require = createRequire(`${rivals}/package.json`)
const qrcode = require('qrcode')
const qrVersion = require('qrcode/package.json').version
if (qrVersion !== '1.5.4') throw new Error(`Unexpected qrcode ${qrVersion}`)
const sha = data => createHash('sha256').update(data).digest('hex')
const categories = [
  {name:'control', shot:{scale:4,angle:0,noise:0}},
  {name:'small', shot:{scale:2,angle:0,noise:4}},
  {name:'perspective', shot:{scale:4,angle:13,perspective:0.38,noise:7}},
  {name:'rotation45', shot:{scale:3,angle:45,noise:6}},
  {name:'cropped-quiet', shot:{scale:4,angle:17,margin:0,noise:5}},
  {name:'finder-erosion', shot:{scale:4,angle:11,noise:4}, damage:'erosion'},
  {name:'finder-occlusion', shot:{scale:4,angle:23,noise:5}, damage:'occlusion'},
  {name:'blur-noise', shot:{scale:4,angle:29,perspective:0.2,blur:1,noise:16}},
]
export function makeCase(group, index) {
  const seed = (0x35a71d9b + group * 0x10203 + index * 0x1f123) >>> 0
  if (group === 8) {
    const kind = index < 8 ? 'noise' : index < 14 ? 'stripes' : index < 20 ? 'checker' : index < 26 ? 'gradient' : 'blank'
    const dimensions = [[320,240],[512,512],[640,360],[240,320]]
    const [width,height] = dimensions[index % dimensions.length]
    let state = seed
    const data = Uint8Array.from({length:width*height}, (_,i) => {
      state = (Math.imul(state,1664525)+1013904223)>>>0
      const x=i%width, y=Math.floor(i/width)
      if (kind === 'noise') return state>>>24
      if (kind === 'stripes') return Math.floor(x/(2+index%5))%2 ? 225 : 30
      if (kind === 'checker') return (Math.floor(x/(2+index%5))+Math.floor(y/(2+index%5)))%2 ? 225 : 30
      if (kind === 'gradient') return Math.floor(255*x/(width-1))
      return [0,127,255][index%3]
    })
    const image={data,width,height}
    return {meta:{id:`negative-${kind}-${index.toString().padStart(2,'0')}`,group:'negative',kind,seed,width,height,expectedText:null,expectedUtf8Hex:null,greySha256:sha(data)},image}
  }
  const c = categories[group]
  const text = `S${group}${index.toString(36)}${seed.toString(36)}`.toUpperCase()
  const versions=[1,2,4,7,12,20,40], eccs=['L','M','Q','H']
  const version=versions[Math.floor(index/4)], ecc=eccs[index%4]
  const qr = qrcode.create(text, { errorCorrectionLevel:ecc, version })
  const size = qr.modules.size, modules = Uint8Array.from(qr.modules.data)
  const finder = c.damage ? index%3 : null
  const [ox,oy] = finder === null ? [0,0] : [[0,0],[size-7,0],[0,size-7]][finder]
  const damage = c.damage === 'erosion' ? (index%2 === 0 ? 'centre-pixel' : 'centre-module') : c.damage || null
  if (damage === 'centre-module') modules[(oy+3)*size+ox+3]=0
  if (damage === 'occlusion') for(let y=2;y<=3;y++) for(let x=2;x<=3;x++) modules[(oy+y)*size+ox+x]=0
  const shot={...c.shot,seed}
  if (group === 1) shot.scale = index % 2 === 0 ? 1 : 2
  let image=photograph(modules,size,shot)
  if (group === 4) {
    const map=frame(size,shot)
    const corners=[[0,0],[size,0],[size,size],[0,size]].map(([x,y])=>map.at(x,y))
    const left=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.x))))
    const top=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.y))))
    const right=Math.min(image.width,Math.ceil(Math.max(...corners.map(p=>p.x))))
    const bottom=Math.min(image.height,Math.ceil(Math.max(...corners.map(p=>p.y))))
    const width=right-left,height=bottom-top,data=new Uint8Array(width*height)
    for(let y=0;y<height;y++) data.set(image.data.subarray((top+y)*image.width+left,(top+y)*image.width+right),y*width)
    image={data,width,height}
  }
  if (damage === 'centre-pixel') {
    const p=frame(size,shot).at(ox+3.5,oy+3.5)
    image.data[Math.floor(p.y)*image.width+Math.floor(p.x)]=225
  }
  return {meta:{id:`${c.name}-${index.toString().padStart(2,'0')}`, group:c.name, seed, ecc, version, size, shot, damage,
    damagedFinder:finder, width:image.width,height:image.height, expectedText:text,expectedUtf8Hex:Buffer.from(text,'utf8').toString('hex'),
    greySha256:sha(image.data)},image}
}

if (process.argv[1] && realpathSync(new URL(import.meta.url)) === realpathSync(process.argv[1])) {
  const cases=[]
  for(let group=0;group<categories.length;group++) for(let i=0;i<28;i++) cases.push(makeCase(group,i).meta)
  for(let i=0;i<32;i++) cases.push(makeCase(8,i).meta)
  const manifest={description:'Frozen synthetic stress frames; corrected quiet-zone crop and small scales before any decoder evaluation; original-v1 and corrected-v2 retained; QR_RIVALS required',count:cases.length,seedFormula:'(0x35a71d9b + group * 0x10203 + index * 0x1f123) >>> 0',
    generatorSha256:sha(readFileSync(new URL('./generate.mjs',import.meta.url))),photoTsSha256:sha(readFileSync(new URL('./photo.ts',import.meta.url))),photoJsSha256:sha(readFileSync(new URL('./photo.mjs',import.meta.url))),
    qrcodeVersion:qrVersion,qrcodeMainSha256:sha(readFileSync(require.resolve('qrcode'))),rivalLockSha256:sha(readFileSync(`${rivals}/package-lock.json`)),cases}
  writeFileSync(new URL('./manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n')
  console.log(`Generated metadata and hashes for ${cases.length} frames; no decoder executed`)
}
