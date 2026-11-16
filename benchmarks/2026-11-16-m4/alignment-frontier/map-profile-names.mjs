// Map a stripped WASM profile only after proving every non-custom section equal.
// node map-profile-names.mjs <profile.json> <stripped.wasm> <named.wasm>
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { strict as assert } from 'node:assert'
const [profilePath, strippedPath, namedPath] = process.argv.slice(2)
const stripped = readFileSync(strippedPath), named = readFileSync(namedPath)
const hash = b => createHash('sha256').update(b).digest('hex')
const decoder = new TextDecoder('utf-8', { fatal: true })
function reader(bytes) {
  let pos = 0
  return {
    get pos() { return pos },
    u32() {
      let value = 0, scale = 1
      for (let i = 0; i < 5; i++) {
        assert(pos < bytes.length, 'Truncated integer')
        const b = bytes[pos++]; value += (b & 127) * scale
        if (!(b & 128)) { assert(value <= 0xffffffff); return value }
        scale *= 128
      }
      throw new Error('Oversized integer')
    },
    take(n) { assert(n <= bytes.length - pos); const b = bytes.subarray(pos, pos + n); pos += n; return b },
    get length() { return bytes.length },
  }
}
function sections(bytes) {
  assert(bytes.subarray(0, 8).equals(Buffer.from([0,97,115,109,1,0,0,0])))
  const r = reader(bytes.subarray(8)), core = [], names = new Map()
  while (r.pos < r.length) {
    const id = r.take(1)[0], payload = r.take(r.u32())
    if (id !== 0) { core.push({ id, payload }); continue }
    const c = reader(payload), title = decoder.decode(c.take(c.u32()))
    if (title !== 'name') continue
    while (c.pos < c.length) {
      const kind = c.take(1)[0], sub = reader(c.take(c.u32()))
      if (kind !== 1) continue
      const count = sub.u32()
      for (let i = 0; i < count; i++) {
        const index = sub.u32(), name = decoder.decode(sub.take(sub.u32()))
        assert(!names.has(index)); names.set(index, name)
      }
      assert.equal(sub.pos, sub.length)
    }
  }
  return { core, names }
}
const a = sections(stripped), b = sections(named)
assert.equal(a.core.length, b.core.length)
for (let i = 0; i < a.core.length; i++) {
  assert.equal(a.core[i].id, b.core[i].id)
  assert(a.core[i].payload.equals(b.core[i].payload), `Section ${a.core[i].id} differs`)
}
assert(b.names.size > 0)
const profile = JSON.parse(readFileSync(profilePath))
assert.equal(profile.wasmSha256, hash(stripped))
const map = row => {
  const match = row.name.match(/^wasm-function\[(\d+)\]/)
  if (!match) return row
  const symbol = b.names.get(Number(match[1])); assert(symbol, 'Missing function name')
  return { ...row, symbol }
}
console.log(JSON.stringify({ ...profile, self: profile.self.map(map), inclusive: profile.inclusive.map(map),
  symbolMapping: { namedWasmSha256: hash(named), strippedWasmSha256: hash(stripped),
    profileSha256: hash(readFileSync(profilePath)), mapperSha256: hash(readFileSync(new URL(import.meta.url))),
    validation: 'All non-custom WASM sections are byte-identical in order; only name metadata is borrowed',
    sections: a.core.map(s => ({ id: s.id, sha256: hash(s.payload) })), functions: b.names.size,
  },
}, null, 2))
