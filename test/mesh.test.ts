// Large symbols seen through a lens that bends them: one projective map
// through the finders and an alignment pattern drifts by more than half a
// module across the symbol, so the ordinary read and the second look's
// shifts fail, and the mesh over the alignment lattice reads them. The
// Kotlin port draws the same frames (MeshTest.kt). Every payload is made up.
import { describe, expect, it } from 'vitest'
import { decodeCounted } from '../src/decode.js'
import { encode } from '../src/encode.js'
import { type Work } from '../src/locate.js'
import { sized } from '../src/refine.js'
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

  it('keeps no candidate whose version information names another size', () => {
    const large = encode('https://example.com/v/large', { ecc: 'M', version: 40 })
    const small = encode('https://example.com/v/small', { ecc: 'M', version: 25 })
    const n = large.size
    const m = small.size
    expect(sized(large.modules, n, false)).toBe(true)
    // Both copies of version 25's block on a version 40 grid: another size, dropped.
    const named = Uint8Array.from(large.modules)
    // Both copies cleared: neither decodes, so the size stands and the map is kept.
    const blank = Uint8Array.from(large.modules)
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        named[(n - 11 + j) * n + i] = small.modules[(m - 11 + j) * m + i]!
        named[i * n + n - 11 + j] = small.modules[i * m + m - 11 + j]!
        blank[(n - 11 + j) * n + i] = 0
        blank[i * n + n - 11 + j] = 0
      }
    }
    expect(sized(named, n, false)).toBe(false)
    expect(sized(blank, n, false)).toBe(true)
    // Read in the other orientation, the transposed grid gives the same answers.
    const transpose = (g: Uint8Array) => Uint8Array.from(g, (_, k) => g[(k % n) * n + Math.floor(k / n)]!)
    expect(sized(transpose(named), n, true)).toBe(false)
    expect(sized(transpose(blank), n, true)).toBe(true)
    expect(sized(transpose(large.modules), n, true)).toBe(true)
  })
})
