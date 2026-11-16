// Independently encoded qrcode 1.5.4 modules from the frozen blur-noise-25 case.
// Keep the original grey hash so this cannot silently become an easier frame.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { photograph, type Shot } from './photo.js'

export const versionHintFixture = JSON.parse(readFileSync(new URL('./version-hint-fixture.json', import.meta.url), 'utf8')) as {
  size: number
  shot: Shot
  expectedText: string
  expectedUtf8Hex: string
  modulesBase64: string
  modulesSha256: string
  greySha256: string
}

export function versionHintModules(): Uint8Array {
  const packed = Buffer.from(versionHintFixture.modulesBase64, 'base64')
  const modules = Uint8Array.from({ length: versionHintFixture.size ** 2 }, (_, i) => (packed[i >> 3]! >>> (7 - (i & 7))) & 1)
  if (createHash('sha256').update(modules).digest('hex') !== versionHintFixture.modulesSha256) throw new Error('Version-hint modules changed')
  return modules
}

export function versionHintPicture() {
  const image = photograph(versionHintModules(), versionHintFixture.size, versionHintFixture.shot)
  if (createHash('sha256').update(image.data).digest('hex') !== versionHintFixture.greySha256) throw new Error('Version-hint photograph changed')
  return image
}
