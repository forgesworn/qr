// Own-encoder renderings of independently generated frozen cases. The hard-coded
// independent grey hashes prevent a manifest edit from silently making them easier.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { encode, type ErrorCorrection } from '../src/encode.js'
import { photograph, type Grey, type Shot } from './photo.js'

const manifest = JSON.parse(readFileSync(new URL('../benchmarks/2026-11-16-m4/overflow-recovery/fresh160/manifest.json', import.meta.url), 'utf8')) as {
  cases: {
    id: string
    size: number
    version: number
    ecc: ErrorCorrection
    expectedText: string
    shot: Shot
    damage: 'none' | 'centre' | 'occlusion'
    damagedFinder: number | null
    padding: number
  }[]
}

const independentHashes = {
  10: '65791166acfdfe5edff98ffb01d45595d777f66198440617113902986b9733df',
  46: 'c28d689e15e95e75bd44d2e1d38f7d736a936853e54486f68fef5476bc798374',
  51: 'd33bdef56c6e4849685b9b64d8fadcf24d900104a050acc74e254617e57ede2e',
  92: 'bbed316491da9225bc06a667d24eebc1c0a79f6f64f1319a6e45348ad92f2c2d',
  94: '41c6df6f22f690bb3e99961606b71427baf3a373e4c87f5557d0179e551020f6',
} as const

export type LowResolutionIndex = keyof typeof independentHashes

function marker(data: Uint8Array, width: number, height: number, cx: number, cy: number, unit: number): void {
  for (let y = Math.max(0, cy - 4 * unit); y < Math.min(height, cy + 4 * unit); y++) {
    for (let x = Math.max(0, cx - 4 * unit); x < Math.min(width, cx + 4 * unit); x++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy)) / unit
      if (d < 3.5) data[y * width + x] = d < 1.5 || d >= 2.5 ? 30 : 225
    }
  }
}

export function lowResolutionPicture(index: LowResolutionIndex): { image: Grey; text: string; version: number; ecc: ErrorCorrection; mirrored: boolean; inverted: boolean } {
  const meta = manifest.cases[index]!
  if (meta.id !== `holdout-${String(index).padStart(3, '0')}`) throw new Error('Low-resolution fixture manifest changed')
  const qr = encode(meta.expectedText, { version: meta.version, ecc: meta.ecc })
  if (qr.size !== meta.size) throw new Error('Low-resolution fixture size changed')
  const modules = qr.modules.slice()
  if (meta.damage !== 'none') {
    const [ox, oy] = [[0, 0], [meta.size - 7, 0], [0, meta.size - 7]][meta.damagedFinder!]! as [number, number]
    if (meta.damage === 'centre') modules[(oy + 3) * meta.size + ox + 3] = 0
    else for (let y = 2; y <= 3; y++) for (let x = 2; x <= 3; x++) modules[(oy + y) * meta.size + ox + x] = 0
  }
  const original = photograph(modules, meta.size, meta.shot)
  const padding = meta.padding
  const width = original.width + padding * 2
  const height = original.height + padding * 2
  const data = new Uint8Array(width * height).fill(200)
  for (let y = 0; y < original.height; y++) data.set(original.data.subarray(y * original.width, (y + 1) * original.width), (y + padding) * width + padding)
  if (padding) for (const [x, y] of [[12, 12], [width - 13, 12], [12, height - 13], [width - 13, height - 13]] as const) {
    marker(data, width, height, x, y, 2)
  }
  if (createHash('sha256').update(data).digest('hex') !== independentHashes[index]) throw new Error('Low-resolution photograph changed')
  return { image: { data, width, height }, text: meta.expectedText, version: meta.version, ecc: meta.ecc, mirrored: meta.shot.mirror ?? false, inverted: meta.shot.invert ?? false }
}
