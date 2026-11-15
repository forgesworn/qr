// Large symbols seen through a lens that bends them: one projective map
// through the finders and an alignment pattern drifts by more than half a
// module across the symbol, so the ordinary read and the second look's
// shifts fail, and the mesh over the alignment lattice reads them. The
// Kotlin port draws the same frames (MeshTest.kt). Every payload is made up.
import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { encode } from '../src/encode.js'
import { type Work } from '../src/locate.js'
import { bent, prng } from './photo.js'

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const counter = (): Work => ({ steps: 0, compared: 0, scanned: 0, maps: 0, second: 0, meshes: 0, probed: 0 })

describe('mesh', () => {
  it('reads bent large symbols through the alignment lattice', () => {
    const random = prng(5150)
    for (const [version, k] of [[12, 0.04], [25, 0.02], [40, 0.02]] as const) {
      for (let t = 0; t < 2; t++) {
        let text = 'https://example.com/m/'
        for (let i = 0; i < 40; i++) text += CHARS[Math.floor(random() * CHARS.length)]
        const qr = encode(text, { ecc: 'M', version })
        const work = counter()
        const got = decodeCounted(bent(qr.modules, qr.size, 4, k), {}, work)
        expect(got?.text).toBe(text)
        expect(got?.version).toBe(version)
        // Read by the second look, through a mesh, within its caps.
        expect(work.meshes).toBeGreaterThan(0)
        expect(work.second).toBeLessThanOrEqual(4)
      }
    }
  })
})
