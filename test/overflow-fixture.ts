// Independently encoded qrcode 1.5.4 modules from the frozen perspective-25 case.
// Keep the original grey hash so this cannot silently become an easier frame.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { photograph, type Shot } from './photo.js'

export const overflowFixture = JSON.parse(readFileSync(new URL('./overflow-fixture.json', import.meta.url), 'utf8')) as {
  size: number
  shot: Shot
  expectedText: string
  expectedUtf8Hex: string
  modulesBase64: string
  modulesSha256: string
  greySha256: string
}

export function overflowModules(): Uint8Array {
  const packed = Buffer.from(overflowFixture.modulesBase64, 'base64')
  const modules = Uint8Array.from({ length: overflowFixture.size ** 2 }, (_, i) => (packed[i >> 3]! >>> (7 - (i & 7))) & 1)
  if (createHash('sha256').update(modules).digest('hex') !== overflowFixture.modulesSha256) throw new Error('Overflow modules changed')
  return modules
}

export function overflowPicture() {
  const image = photograph(overflowModules(), overflowFixture.size, overflowFixture.shot)
  if (createHash('sha256').update(image.data).digest('hex') !== overflowFixture.greySha256) throw new Error('Overflow photograph changed')
  return image
}
