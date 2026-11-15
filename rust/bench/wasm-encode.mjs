// Checks the WebAssembly encoder against the TypeScript one: for every
// encoder vector, the same version, mask and modules.
//
//   node rust/bench/wasm-encode.mjs [file.wasm] [encode-vectors.json]
//
// Needs `npm ci && npm run build` (dist/) and the release WebAssembly build.

import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadFront } from './loader.js'
import { encode } from '../../dist/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const wasmPath = resolve(process.argv[2] ?? join(here, '../target/wasm32-unknown-unknown/release/forgesworn_qr.wasm'))
const vectorsPath = resolve(process.argv[3] ?? join(here, '../../vectors/encode-vectors.json'))
const { encode: wasmEncode } = await loadFront(wasmPath)
const pack = JSON.parse(readFileSync(vectorsPath, 'utf8'))

let equal = 0
for (const v of pack.vectors) {
  const options = { ecc: v.ecc, version: v.requestedVersion ?? undefined, mask: v.requestedMask ?? undefined, eci: v.eci }
  const ts = encode(v.text, options)
  const wasm = wasmEncode(v.text, options)
  const same =
    ts.version === wasm.version &&
    ts.mask === wasm.mask &&
    ts.size === wasm.size &&
    ts.modules.length === wasm.modules.length &&
    ts.modules.every((m, i) => m === wasm.modules[i])
  if (!same) throw new Error(`${v.id}: the WebAssembly symbol differs from the TypeScript one`)
  equal++
}
console.log(`wasm encoder: ${equal} of ${pack.vectors.length} vectors equal to the TypeScript, module for module`)

// Bytes, and the failures, through the same exports.
const bytes = Uint8Array.from([0, 1, 2, 250, 255])
const a = encode(bytes, { ecc: 'Q' })
const b = wasmEncode(bytes, { ecc: 'Q' })
if (a.version !== b.version || a.mask !== b.mask || !a.modules.every((m, i) => m === b.modules[i])) throw new Error('bytes differ')
const code = (f) => {
  try {
    f()
  } catch (e) {
    return e.code
  }
  return 0
}
const expect = (name, got, want) => {
  if (got !== want) throw new Error(`${name}: error code ${got}, wanted ${want}`)
}
expect('too large', code(() => wasmEncode(new Uint8Array(3000), { ecc: 'L' })), 1)
expect('version 41', code(() => wasmEncode('x', { version: 41 })), 2)
expect('minVersion 41', code(() => wasmEncode('x', { minVersion: 41 })), 3)
expect('mask 8', code(() => wasmEncode('x', { mask: 8 })), 4)
expect('below min', code(() => wasmEncode('x', { version: 2, minVersion: 3 })), 5)
expect('bytes numeric', code(() => wasmEncode(bytes, { mode: 'numeric' })), 6)
expect('text outside mode', code(() => wasmEncode('abc', { mode: 'numeric' })), 7)
expect('level', code(() => wasmEncode('x', { ecc: 'Z' })), 8)
console.log('wasm encoder: bytes and the error codes agree')
console.log(`wasm size: ${statSync(wasmPath).size} bytes`)
