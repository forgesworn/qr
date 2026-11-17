// Development frames: thinned and thickened modules across versions. Used to
// choose a policy, so never validation evidence. Imports no decoder.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { render, prng } from './render.mjs'
export function framesFor(rivals, { seed = 0x5eed0d0e, prefix = 'spread-dev' } = {}) {
  const ext = createRequire(rivals + '/package.json')
  assert.equal(ext('qrcode/package.json').version, '1.5.4')
  const qr = ext('qrcode'), random = prng(seed), frames = []
  const versions = [2, 4, 6, 8, 10, 14, 20, 27, 33, 40]
  for (const spread of [-0.3, -0.2, -0.12, 0.12, 0.2, 0.3]) for (const version of versions) for (let k = 0; k < 2; k++) {
    const index = frames.length
    const ecc = ['L', 'M', 'Q', 'H'][index % 4]
    let tail = ''
    for (let i = 0; i < 40 * version; i++) tail += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(random() * 36)]
    let text, q
    for (let n = 40 * version; ; n = Math.floor(n * 0.85)) {
      text = `${prefix.toUpperCase()}-${index}-` + tail.slice(0, n)
      try { q = qr.create(text, { version, errorCorrectionLevel: ecc }); break } catch { if (n === 0) throw Error('no fit') }
    }
    const size = q.modules.size
    const scale = version >= 27 ? 3 + random() * 2 : 2.5 + random() * 3.5
    const shot = { scale, angle: (random() - 0.5) * 40, perspective: random() * 0.25, spread, blur: random() < 0.3 ? 1 : 0, noise: 4 + random() * 10, seed: (seed + index * 0x9e3779b9) >>> 0, invert: index % 7 === 3 }
    const image = render(Uint8Array.from(q.modules.data), size, shot)
    frames.push({ meta: { id: `${prefix}-${index}`, version, ecc, spread, scale: +scale.toFixed(3), shot }, image, text })
  }
  return frames
}
