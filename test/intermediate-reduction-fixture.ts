import { encode } from '../src/encode.js'
import { photograph } from './photo.js'

export const intermediateText = 'TRY3-EG'
/** Grain covers a tilted, mirrored symbol that reads at factor 3. */
export function intermediatePicture(inverted: boolean) {
  const qr = encode(intermediateText, { version: 1, ecc: 'Q' })
  const image = photograph(qr.modules, qr.size, {
    scale: 5.5, angle: -7, perspective: 0.14, margin: 2,
    noise: 96, shade: 0.8, seed: inverted ? 26060 : 26053, mirror: true,
  })
  return inverted ? { ...image, data: Uint8Array.from(image.data, v => 255 - v) } : image
}
