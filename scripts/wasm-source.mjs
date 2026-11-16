import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

export const root = new URL('../', import.meta.url)
export const compiler = 'rustc 1.96.0 (ac68faa20 2026-05-25)'
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export function sourceHash() {
  const hash = createHash('sha256')
  const files = ['rust/Cargo.toml', 'rust/Cargo.lock', 'scripts/build-wasm.mjs', 'scripts/wasm-source.mjs']
  for (const name of readdirSync(new URL('rust/src/', root)).filter(n => n.endsWith('.rs')).sort()) files.push('rust/src/' + name)
  for (const file of files.sort()) hash.update(file + '\0').update(readFileSync(new URL(file, root)))
  return hash.digest('hex')
}
