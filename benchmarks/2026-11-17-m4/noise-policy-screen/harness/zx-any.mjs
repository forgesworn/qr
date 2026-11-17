// ZXing-WASM reads of the development frames, for comparison only. Diagnostic.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const { framesFor } = await import(process.argv[3] === 'step9' ? './erosion/step9.mjs' : './erosion/dev.mjs')
const rivals = (await import('node:path')).resolve(process.argv[2])
const ext = createRequire(rivals + '/package.json')
const zx = await import(pathToFileURL(ext.resolve('zxing-wasm/reader')).href)
const bytes = readFileSync(ext.resolve('zxing-wasm/reader/zxing_reader.wasm'))
if (createHash('sha256').update(bytes).digest('hex') !== '33c8c50be17d0bb05454b4fd3ffb5b5ab9a8e8d1c0ebeb21a1adf4a89c1a8b59') throw Error('zxing binary')
await zx.prepareZXingModule({ overrides: { wasmBinary: bytes }, fireImmediately: true })
const options = { formats: ['QRCode'], maxNumberOfSymbols: 1, tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, textMode: 'Plain' }
for (const f of framesFor(rivals)) {
  const rgba = new Uint8ClampedArray(f.image.width * f.image.height * 4)
  for (let i = 0; i < f.image.data.length; i++) { rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = f.image.data[i]; rgba[4 * i + 3] = 255 }
  const r = (await zx.readBarcodes({ data: rgba, width: f.image.width, height: f.image.height }, options))[0]
  console.log(JSON.stringify({ name: f.meta.id, zxing: r ? (r.text === f.text ? 'correct' : 'wrong') : 'miss' }))
}
