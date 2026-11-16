import { describe, expect, it } from 'vitest'
import { encode, versionBits } from '../src/encode.js'
import { decodeCounted } from '../src/decode.js'
import type { Work } from '../src/locate.js'

// A wrong but valid version block makes the ordinary read stop before it
// reaches the format bits. Both orientations must still be considered when
// retaining maps for the second look.
function picture(mirror: boolean, wrongVersion: boolean) {
  const qr = encode('sampling regression v7', { version: 7, ecc: 'M' })
  const modules = qr.modules.slice()
  const size = qr.size
  if (wrongVersion) {
    const bits = versionBits(8)
    for (let k = 0; k < 18; k++) {
      const i = Math.floor(k / 3), j = k % 3, value = (bits >>> k) & 1
      modules[(size - 11 + j) * size + i] = value
      modules[i * size + size - 11 + j] = value
    }
  }
  const width = (size + 8) * 4
  const data = new Uint8Array(width * width).fill(255)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!modules[mirror ? x * size + y : y * size + x]) continue
    for (let dy = 0; dy < 4; dy++) data.fill(0, ((y + 4) * 4 + dy) * width + (x + 4) * 4, ((y + 4) * 4 + dy) * width + (x + 5) * 4)
  }
  return { data, width, height: width }
}

describe('projective sampling', () => {
  it.each([false, true])('preserves straight and mirrored version rejection (mirror %s)', (mirror) => {
    const clean = decodeCounted(picture(mirror, false))
    expect(clean).toMatchObject({ text: 'sampling regression v7', mirrored: mirror })
    const work: Work = { steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0, reduced: 0 }
    expect(decodeCounted(picture(mirror, true), {}, work)).toBeUndefined()
    expect(work.second).toBe(4)
    expect(work.meshes).toBe(4)
  })
})
