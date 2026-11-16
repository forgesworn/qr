// Ordinary npm builds require no Rust toolchain. Verify and copy the frozen asset.
import { copyFileSync, readFileSync } from 'node:fs'
import { root, sha256, sourceHash } from './wasm-source.mjs'

const manifest = JSON.parse(readFileSync(new URL('wasm/manifest.json', root), 'utf8'))
const bytes = readFileSync(new URL('wasm/qr.wasm', root))
if (manifest.sha256 !== sha256(bytes) || manifest.bytes !== bytes.length || manifest.sourceSha256 !== sourceHash()) {
  throw new Error('The bundled WASM is stale or corrupt; run npm run build:wasm')
}
copyFileSync(new URL('wasm/qr.wasm', root), new URL('dist/qr.wasm', root))
copyFileSync(new URL('wasm/manifest.json', root), new URL('dist/wasm-manifest.json', root))
