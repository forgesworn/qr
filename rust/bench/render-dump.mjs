// The TypeScript side of the renderer comparison: the same lines as
// `examples/render_dump.rs`, from `toSvg` and `toTerminal`.
//
//   node rust/bench/render-dump.mjs [encode-vectors.json] > render-ts.txt
//
// Needs `npm ci && npm run build` (dist/). Each line is
// `<vector id> <option set name> <SHA-256 of the UTF-8 output>`.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { encode, toSvg, toTerminal } from '../../dist/index.js'

const path = process.argv[2] ?? new URL('../../vectors/encode-vectors.json', import.meta.url).pathname
const pack = JSON.parse(readFileSync(path, 'utf8'))

// Markup, quotes, a control character and a lone surrogate.
const title = 'a <b> & "c" \u0001 \ud800'
const sets = [
  ['svg-default', (qr) => toSvg(qr)],
  ['svg-plain', (qr) => toSvg(qr, { margin: 0, dark: '#123', light: null })],
  ['svg-title', (qr) => toSvg(qr, { title })],
  ['term-default', (qr) => toTerminal(qr)],
  ['term-margin1-dark', (qr) => toTerminal(qr, { margin: 1, ink: 'dark' })],
]

const lines = []
for (const v of pack.vectors) {
  const qr = encode(v.text, {
    ecc: v.ecc,
    version: v.requestedVersion ?? undefined,
    mask: v.requestedMask ?? undefined,
    eci: v.eci,
  })
  for (const [name, render] of sets) {
    lines.push(`${v.id} ${name} ${createHash('sha256').update(render(qr), 'utf8').digest('hex')}`)
  }
}
process.stdout.write(lines.join('\n') + '\n')
