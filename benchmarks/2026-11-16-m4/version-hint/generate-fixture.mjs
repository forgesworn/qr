import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const root=process.argv[2],rivals=process.env.QR_RIVALS
const external=createRequire(pathToFileURL(rivals+'/package.json'))
const {makeCase}=await import(pathToFileURL(root+'/benchmarks/2026-11-16-m4/fresh-stress-unevaluated/generate.mjs'))
const {meta,image}=makeCase(7,25)
const qr=external('qrcode').create(meta.expectedText,{errorCorrectionLevel:meta.ecc,version:meta.version})
const modules=Uint8Array.from(qr.modules.data), packed=new Uint8Array(Math.ceil(modules.length/8))
for(let i=0;i<modules.length;i++)packed[i>>3]|=modules[i]<<(7-(i&7))
const hash=data=>createHash('sha256').update(data).digest('hex')
if(hash(image.data)!==meta.greySha256)throw Error('Frame identity mismatch')
writeFileSync(root+'/test/version-hint-fixture.json',JSON.stringify({oracle:'qrcode 1.5.4',...meta,modulesSha256:hash(modules),modulesBase64:Buffer.from(packed).toString('base64')},null,2)+'\n')
console.log(meta.id,meta.greySha256)
