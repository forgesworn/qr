// Frozen manifest generation only: no decoder imports or calls.
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { photograph, prng } from './photo.mjs'

const rivals = process.env.QR_RIVALS
if (!rivals) throw Error('QR_RIVALS required')
const require = createRequire(`${rivals}/package.json`)
const qr = require('qrcode')
const qrcodeVersion = require('qrcode/package.json').version
if (qrcodeVersion !== '1.5.4') throw Error('qrcode 1.5.4 required')
const hash = value => createHash('sha256').update(value).digest('hex')
const versions = [1, 2, 4, 7, 12, 20, 32, 40]
const eccs = ['L', 'M', 'Q', 'H']
function balanced(values, seed) {
  const out = Array.from({ length: 192 }, (_, i) => values[i % values.length])
  const random = prng(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
const factors = {
  rotation: balanced([0, 13, 37, 45, 73, 112], 0x6df21a09),
  scale: balanced([1, 1.5, 2, 2.5, 3, 4], 0x394ab81d),
  perspective: balanced([0, .08, .18, .3, .43, .2], 0x17c94a63),
  noise: balanced([0, 0, 5, 9, 12, 16], 0x51d82b07),
  damage: balanced(['none', 'none', 'none', 'centre'], 0x2c811da5),
  invert: balanced([false, false, false, true], 0x74f19b23),
  mirror: balanced([false, false, false, true], 0x461ac25d),
  distractors: balanced([false, false, true, true], 0x129e47b1),
  payload: balanced(['alpha', 'byte'], 0x68a31c97),
}
function marker(data, width, height, cx, cy, unit) {
  for (let y = Math.max(0, cy - 4 * unit); y < Math.min(height, cy + 4 * unit); y++) {
    for (let x = Math.max(0, cx - 4 * unit); x < Math.min(width, cx + 4 * unit); x++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy)) / unit
      if (d < 3.5) data[y * width + x] = d < 1.5 || d >= 2.5 ? 30 : 225
    }
  }
}
export function makeCase(i) {
  if (!Number.isInteger(i) || i < 0 || i >= 224) throw Error('case index')
  const seed = (0x1e9d4c7b + Math.imul(i + 1, 0x1b35a7)) >>> 0
  const random = prng(seed)
  const id = `low-resolution-validation-${String(i).padStart(3, '0')}`
  if (i >= 192) {
    const kind = ['noise', 'checker', 'stripes', 'finder-tiles'][(i - 192) % 4]
    const width = 144 + Math.floor(random() * 200)
    const height = 144 + Math.floor(random() * 200)
    const phase = Math.floor(random() * 16)
    const cell = 2 + Math.floor(random() * 10)
    const data = new Uint8Array(width * height)
    const markers = []
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      data[y * width + x] = kind === 'noise' ? Math.floor(random() * 256) : kind === 'checker' ? ((Math.floor((x + phase) / cell) + Math.floor((y + phase) / cell)) % 2 ? 225 : 30) : kind === 'stripes' ? (Math.floor((x + phase) / cell) % 2 ? 225 : 30) : 225
    }
    if (kind === 'finder-tiles') for (let n = 0; n < 5; n++) {
      const x = 20 + Math.floor(random() * (width - 40))
      const y = 20 + Math.floor(random() * (height - 40))
      const unit = 2 + Math.floor(random() * 3)
      marker(data, width, height, x, y, unit)
      markers.push({ x, y, unit })
    }
    return { meta: { id, seed, kind, phase, cell, markers, width, height, expectedText: null, expectedUtf8Hex: null, greySha256: hash(data) }, image: { data, width, height } }
  }
  const version = versions[Math.floor(i / 24)]
  const ecc = eccs[Math.floor(i / 4) % 4]
  const replicate = i % 4
  const alphabet = factors.payload[i] === 'byte' ? 'abcdefghijklmnopqrstuvwxyz0123456789' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const safeBytes = { 1: 7, 2: 14, 4: 34, 7: 64, 12: 100, 20: 100, 32: 100, 40: 100 }[version]
  const length = Math.min(version === 1 ? 4 + replicate : 8 + version * 2 + replicate * 3, safeBytes)
  let text = `LR${i.toString(36).toUpperCase()}-`
  for (let k = 0; text.length < length; k++) text += alphabet[Math.floor(random() * alphabet.length)]
  const encoded = qr.create(text, { version, errorCorrectionLevel: ecc })
  const size = encoded.modules.size
  const modules = Uint8Array.from(encoded.modules.data)
  const damage = factors.damage[i]
  let damagedFinder = null
  if (damage !== 'none') {
    damagedFinder = Math.floor(random() * 3)
    const [ox, oy] = [[0, 0], [size - 7, 0], [0, size - 7]][damagedFinder]
    modules[(oy + 3) * size + ox + 3] = 0
  }
  const shot = { scale: factors.scale[i], angle: factors.rotation[i], perspective: factors.perspective[i], seed, noise: factors.noise[i], invert: factors.invert[i], mirror: factors.mirror[i] }
  const original = photograph(modules, size, shot)
  const padding = factors.distractors[i] ? 32 : 0
  const width = original.width + padding * 2
  const height = original.height + padding * 2
  const data = new Uint8Array(width * height).fill(200)
  for (let y = 0; y < original.height; y++) data.set(original.data.subarray(y * original.width, (y + 1) * original.width), (y + padding) * width + padding)
  const distractors = []
  if (padding) for (const [x, y] of [[12, 12], [width - 13, 12], [12, height - 13], [width - 13, height - 13]]) {
    marker(data, width, height, x, y, 2)
    distractors.push({ x, y, unit: 2 })
  }
  const image = { data, width, height }
  return { meta: { id, seed, version, ecc, replicate, size, payloadKind: factors.payload[i], shot, damage, damagedFinder, padding, distractorCount: distractors.length, distractors, width, height, expectedText: text, expectedUtf8Hex: Buffer.from(text).toString('hex'), greySha256: hash(data) }, image }
}
if (process.argv[1] && realpathSync(new URL(import.meta.url)) === realpathSync(process.argv[1])) {
  const cases = Array.from({ length: 224 }, (_, i) => makeCase(i).meta)
  const pixels = new Set(cases.map(c => c.greySha256))
  if (pixels.size !== cases.length) throw Error('duplicate grey frame hash')
  const previous = ['benchmarks/2026-11-16-m4/fresh-stress-unevaluated/manifest.json', 'benchmarks/2026-11-16-m4/overflow-recovery/fresh160/manifest.json']
  for (const path of previous) {
    const old = JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8'))
    for (const c of cases) {
      if (old.cases.some(o => o.greySha256 === c.greySha256 || c.expectedText !== null && o.expectedText === c.expectedText)) throw Error(`input repeated from ${path}`)
    }
  }
  const factorCounts = Object.fromEntries(Object.entries(factors).map(([name, values]) => [name, Object.fromEntries([...new Set(values)].map(value => [String(value), values.filter(x => x === value).length]))]))
  const manifest = { description: 'Fresh low-resolution validation frozen before any decoder evaluation; independent qrcode encoder and existing synthetic photograph renderer', count: cases.length, factorCounts, qrcodeVersion, qrcodeMainSha256: hash(readFileSync(require.resolve('qrcode'))), generatorSha256: hash(readFileSync(new URL(import.meta.url))), photoSha256: hash(readFileSync(new URL('./photo.mjs', import.meta.url))), rivalLockSha256: hash(readFileSync(`${rivals}/package-lock.json`)), cases }
  writeFileSync(new URL('./manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  console.log(`Froze ${cases.length} unique frames without importing or calling a decoder`)
}
