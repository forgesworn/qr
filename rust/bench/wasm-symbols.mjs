// Module grids through the WebAssembly module: the pack's `symbols`, and
// symbols with structured-append and FNC1 headers built here by hand (the
// builder of test/builder.ts, ported: its own Reed-Solomon and interleave,
// then the TypeScript Grid for placement and masks).
//
//   node rust/bench/wasm-symbols.mjs grids <out.json>
//       writes the hand-built grids (name, size, rows in hex) for the native example
//   cargo run --example symbols_dump -- <grids.json> > native.txt
//   node rust/bench/wasm-symbols.mjs check <native.txt> <grids.json> [wasm file]
//       reads every grid through the module and checks it; exits 1 on a difference
//
// Needs `npm ci && npm run build` (dist/) for the Grid and for decodeModules.
//
// The check, for each of the pack's symbols: the module reads it exactly when
// the pack says it does (the hanzi entry is the one allowed exception: this
// port refuses it), and bytes, version, ecc, mask, eci, corrected and
// mirrored equal the pack's. Its text equals the pack's, except on the
// entries where the Rust port's text differs by design, and in every case
// equals the native Rust's. For the hand-built grids, every field including
// structured append and FNC1 equals the native Rust's and the TypeScript's.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ALPHANUMERIC, blocksFor, EXP, gfMul, Grid } from '../../dist/encode.js'
import { decodeModules } from '../../dist/decode.js'
import { loadFront } from './loader.js'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))

// ---- The builder ----------------------------------------------------------

const bitsOf = (value, length) => Array.from({ length }, (_, i) => (value >>> (length - 1 - i)) & 1)

function remainder(data, degree) {
  let gen = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array(gen.length + 1).fill(0)
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]
      next[j + 1] ^= gfMul(gen[j], EXP[i])
    }
    gen = next
  }
  const out = new Uint8Array(degree)
  for (const byte of data) {
    const factor = byte ^ out[0]
    out.copyWithin(0, 1)
    out[degree - 1] = 0
    for (let i = 0; i < degree; i++) out[i] ^= gfMul(gen[i + 1], factor)
  }
  return out
}

function symbol(bits, version, ecc, mask) {
  const [ec, g1, d1, g2] = blocksFor(version, ecc)
  const capacity = (g1 * d1 + g2 * (d1 + 1)) * 8
  if (bits.length > capacity) throw new RangeError('Too long for the symbol')
  const all = bits.slice()
  for (let i = 0; i < 4 && all.length < capacity; i++) all.push(0)
  while (all.length % 8) all.push(0)
  const words = new Uint8Array(capacity / 8)
  for (let i = 0; i < all.length; i += 8) words[i / 8] = all.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0)
  for (let i = all.length / 8, pad = 0xec; i < words.length; i++, pad ^= 0xec ^ 0x11) words[i] = pad
  const data = []
  const checks = []
  for (let b = 0, offset = 0; b < g1 + g2; b++) {
    const length = b < g1 ? d1 : d1 + 1
    data.push(words.subarray(offset, offset + length))
    checks.push(remainder(words.subarray(offset, offset + length), ec))
    offset += length
  }
  const stream = []
  for (let i = 0; i <= d1; i++) for (const block of data) if (i < block.length) stream.push(block[i])
  for (let i = 0; i < ec; i++) for (const block of checks) stream.push(block[i])
  const grid = new Grid(version)
  grid.placeData(Uint8Array.from(stream))
  return { modules: grid.render(ecc, mask), size: grid.size }
}

const seg = {
  alnum(text, countBits) {
    const out = [...bitsOf(2, 4), ...bitsOf(text.length, countBits)]
    for (let i = 0; i < text.length; i += 2) {
      const a = ALPHANUMERIC.indexOf(text[i])
      out.push(...(i + 1 < text.length ? bitsOf(a * 45 + ALPHANUMERIC.indexOf(text[i + 1]), 11) : bitsOf(a, 6)))
    }
    return out
  },
  bytes(bytes, countBits) {
    const out = [...bitsOf(4, 4), ...bitsOf(bytes.length, countBits)]
    for (const b of bytes) out.push(...bitsOf(b, 8))
    return out
  },
  eci: (value) => [...bitsOf(7, 4), ...(value < 128 ? bitsOf(value, 8) : bitsOf(0x8000 | value, 16))],
  structuredAppend: (index, total, parity) => [...bitsOf(3, 4), ...bitsOf(index, 4), ...bitsOf(total - 1, 4), ...bitsOf(parity, 8)],
  fncFirst: () => bitsOf(5, 4),
  fncSecond: (indicator) => [...bitsOf(9, 4), ...bitsOf(indicator, 8)],
}

const utf8 = (s) => new TextEncoder().encode(s)

// Versions 1 to 9 write 8 bits of character count for bytes and 9 for alphanumeric.
const BUILT = [
  ['structured append 2 of 3, parity 5a', [...seg.structuredAppend(1, 3, 0x5a), ...seg.bytes(utf8('second part'), 8)], 1, 'L', 2],
  ['structured append 16 of 16, parity ff', [...seg.structuredAppend(15, 16, 0xff), ...seg.bytes(utf8('x'), 8)], 2, 'M', 5],
  ['structured append 1 of 1, parity 00, empty part', [...seg.structuredAppend(0, 1, 0), ...seg.bytes(utf8(''), 8)], 1, 'Q', 7],
  ['FNC1 first position, group separators and percent signs', [...seg.fncFirst(), ...seg.alnum('1A%2B%%3', 9)], 1, 'M', 0],
  ['FNC1 second position, indicator 37', [...seg.fncSecond(37), ...seg.bytes(utf8('lot 7'), 8)], 2, 'L', 1],
  ['FNC1 second position, indicator letter A', [...seg.fncSecond(165), ...seg.alnum('A%B', 9)], 1, 'H', 4],
  ['structured append with FNC1 first position', [...seg.structuredAppend(0, 2, 7), ...seg.fncFirst(), ...seg.alnum('1A%2B', 9)], 2, 'L', 3],
  ['structured append, ECI 26 and FNC1 second position', [...seg.structuredAppend(3, 4, 0x11), ...seg.eci(26), ...seg.fncSecond(48), ...seg.bytes(utf8('café'), 8)], 2, 'M', 6],
]

const toHex = (bytes) => Buffer.from(bytes).toString('hex')

function builtGrids() {
  return BUILT.map(([name, bits, version, ecc, mask]) => {
    const { modules, size } = symbol(bits, version, ecc, mask)
    const rows = []
    for (let y = 0; y < size; y++) {
      const row = new Uint8Array(Math.ceil(size / 8))
      for (let x = 0; x < size; x++) if (modules[y * size + x]) row[x >> 3] |= 0x80 >> (x & 7)
      rows.push(toHex(row))
    }
    return { name, size, rows }
  })
}

function modulesOf(entry) {
  const { size } = entry
  const modules = new Uint8Array(size * size)
  entry.rows.forEach((row, y) => {
    const bytes = Buffer.from(row, 'hex')
    for (let x = 0; x < size; x++) modules[y * size + x] = (bytes[x >> 3] >> (7 - (x & 7))) & 1
  })
  return modules
}

// ---- The line, the same as examples/symbols_dump.rs prints -----------------

function line(name, r) {
  if (r === undefined) return `${name}\t-`
  const sa = r.structuredAppend === undefined ? '-' : `${r.structuredAppend.index}/${r.structuredAppend.total}/${r.structuredAppend.parity}`
  const fnc1 = r.fnc1 === undefined ? '-' : r.fnc1.position === 'first' ? 'first' : `second:${r.fnc1.applicationIndicator}`
  return [
    name,
    toHex(r.bytes) || '-',
    `v${r.version} ${r.ecc} m${r.mask} c${r.corrected} ${r.mirrored}`,
    `eci=${r.eci.length === 0 ? '-' : r.eci.join(',')}`,
    `sa=${sa}`,
    `fnc1=${fnc1}`,
    `text=${toHex(utf8(r.text)) || '-'}`,
  ].join('\t')
}

// ---- Modes ------------------------------------------------------------------

const [mode, first, second, third] = process.argv.slice(2)

if (mode === 'grids') {
  if (!first) throw new TypeError('an output file')
  writeFileSync(first, JSON.stringify(builtGrids()))
  console.log(`wrote ${BUILT.length} grids to ${first}`)
} else if (mode === 'check') {
  if (!first || !second) throw new TypeError('the native output and the grids file')
  const wasm = third ?? here('../target/wasm32-unknown-unknown/release/forgesworn_qr.wasm')
  const { decodeGrid } = await loadFront(wasm)
  const pack = JSON.parse(readFileSync(here('../../vectors/conformance.json'), 'utf8'))
  const extras = JSON.parse(readFileSync(second, 'utf8'))
  const native = new Map(readFileSync(first, 'utf8').split('\n').filter(Boolean).map((l) => [l.split('\t')[0], l]))
  let differences = 0
  const differ = (name, what, got, want) => {
    differences++
    console.log(`DIFFERENCE ${name}: ${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
  }
  const same = (name, what, got, want) => {
    if (got !== want) differ(name, what, got, want)
  }

  let packRead = 0
  let packRefused = 0
  let packText = 0
  let packTextByDesign = []
  for (const entry of pack.symbols) {
    const name = entry.name
    const got = decodeGrid(modulesOf(entry), entry.size)
    const want = entry.result
    const wasNative = native.get(name)
    if (wasNative === undefined) differ(name, 'native line', undefined, 'a line')
    else same(name, 'line against the native Rust', line(name, got), wasNative)
    if (got === undefined) {
      // Only the hanzi entry may refuse where the pack reads.
      if (want !== null && name !== 'hanzi mode, GB2312') differ(name, 'refused', 'no read', 'a read')
      packRefused++
      continue
    }
    if (want === null) {
      differ(name, 'read', 'a read', 'no read')
      continue
    }
    packRead++
    same(name, 'bytes', toHex(got.bytes), want.bytes)
    same(name, 'version', got.version, want.version)
    same(name, 'ecc', got.ecc, want.ecc)
    same(name, 'mask', got.mask, want.mask)
    same(name, 'eci', JSON.stringify(got.eci), JSON.stringify(want.eci))
    same(name, 'corrected', got.corrected, want.corrected)
    same(name, 'mirrored', got.mirrored, want.mirrored)
    if (got.text === want.text) packText++
    else packTextByDesign.push(name)
  }
  console.log(`pack symbols: ${pack.symbols.length} entries, ${packRead} read by the module and ${packRefused} not (${pack.symbols.filter((e) => e.result === null).length} that the pack says do not read, and hanzi); bytes, version, ecc, mask, eci, corrected and mirrored equal the pack's on all ${packRead} read`)
  console.log(`pack symbols: text equals the pack's on ${packText}; differs on ${packTextByDesign.length} (${packTextByDesign.join('; ')}); on all of them it equals the native Rust's`)

  let built = 0
  for (const entry of extras) {
    const name = entry.name
    const modules = modulesOf(entry)
    const got = decodeGrid(modules, entry.size)
    const wasNative = native.get(name)
    if (wasNative === undefined) differ(name, 'native line', undefined, 'a line')
    else same(name, 'line against the native Rust', line(name, got), wasNative)
    const ts = decodeModules(modules, entry.size)
    // The TypeScript result has no `inverted` or `location`; the same line says the rest.
    same(name, 'line against the TypeScript', line(name, got), line(name, ts))
    if (got === undefined) continue
    same(name, 'structuredAppend', JSON.stringify(got.structuredAppend), JSON.stringify(ts.structuredAppend))
    same(name, 'fnc1', JSON.stringify(got.fnc1), JSON.stringify(ts.fnc1))
    same(name, 'text', got.text, ts.text)
    built++
    console.log(`  ${line(name, got).replaceAll('\t', ' | ')}`)
  }
  const withSa = extras.filter((e) => native.get(e.name)?.includes('\tsa=') && !native.get(e.name).includes('\tsa=-\t')).length
  const withFnc1 = extras.filter((e) => native.get(e.name) && !native.get(e.name).includes('\tfnc1=-\t')).length
  console.log(`built symbols: ${extras.length} grids, ${built} read by the module, ${withSa} with structured append and ${withFnc1} with FNC1 (by the native Rust's lines)`)
  console.log(`${differences} differences`)
  process.exit(differences === 0 ? 0 : 1)
} else {
  throw new TypeError('mode must be grids or check')
}
