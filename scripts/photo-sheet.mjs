// Makes the sheet of codes to photograph for the project's own test set:
// vectors/own-photos.json, the codes and what each holds, and a printable
// vectors/own-photos-sheet.html (not committed). Every payload is made up
// from a fixed seed, so the sheet is the same each time. Run through
// `npm run photo-sheet`, which builds the library first. vectors/README.md
// says what to photograph and how the pictures are named.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const dist = new URL('../dist/index.js', import.meta.url)
if (!existsSync(dist)) throw new Error('Build the library first: npm run build')
const { encode, toSvg } = await import(dist.href)

/** The generator the test suites share: (s * 1664525 + 1013904223) mod 2^32, over 2^32. */
function prng(seed) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}
const random = prng(20261115)
const pick = (alphabet, n) => Array.from({ length: n }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')
const HEX = '0123456789abcdef'
const UPPER = '0123456789ACDEFGHJKLMNPQRSTUVWXYZ'
const URLSAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// What each code holds, by kind, and the levels and lengths that spread them
// from version 1 to the large versions a phone still reads off paper.
const kinds = [
  (n) => pick('0123456789', n),
  (n) => `https://example.com/p/${pick(HEX, n)}`,
  (n) => `lightning:LNBC${pick(UPPER, n)}`,
  (n) => `https://example.com/r/${pick(HEX, 12)}?k=${pick(URLSAFE, n)}`,
]
const plan = [
  [0, 'L', 8], [0, 'H', 30], [1, 'M', 4], [1, 'Q', 16], [1, 'H', 40], [2, 'L', 40],
  [2, 'M', 120], [2, 'Q', 260], [3, 'L', 20], [3, 'M', 60], [3, 'Q', 140], [3, 'H', 220],
  [1, 'L', 300], [2, 'H', 400], [3, 'M', 700], [0, 'M', 900], [1, 'M', 90], [3, 'L', 1200],
  [0, 'Q', 12], [2, 'L', 12], [1, 'H', 8], [3, 'H', 30], [2, 'M', 60], [0, 'L', 200],
]

const codes = plan.map(([kind, ecc, length], i) => {
  const text = kinds[kind](length)
  const qr = encode(text, { ecc })
  return { id: `own-${String(i + 1).padStart(2, '0')}`, text, ecc, version: qr.version, qr }
})

const manifest = {
  note:
    'Codes for the project\'s own photographs. Each is printed from the sheet `npm run photo-sheet` makes and ' +
    'photographed as vectors/README.md describes; "text" is the exact payload. All payloads are made up.',
  codes: codes.map(({ id, text, ecc, version }) => ({ id, text, ecc, version })),
}
const manifestUrl = new URL('../vectors/own-photos.json', import.meta.url)
const next = `${JSON.stringify(manifest, null, 1)}\n`
if (!existsSync(manifestUrl) || readFileSync(manifestUrl, 'utf8') !== next) writeFileSync(manifestUrl, next)

const cells = codes
  .map(({ id, ecc, version, qr }) => `<figure>${toSvg(qr, { margin: 4, title: id })}<figcaption>${id} &middot; version ${version}-${ecc}</figcaption></figure>`)
  .join('\n')
const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Codes to photograph</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font: 9pt/1.3 system-ui, sans-serif; margin: 0; }
  main { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm 4mm; }
  figure { margin: 0; break-inside: avoid; text-align: center; }
  svg { width: 55mm; height: 55mm; }
  figcaption { margin-top: 1mm; }
</style>
<main>
${cells}
</main>
</html>
`
writeFileSync(new URL('../vectors/own-photos-sheet.html', import.meta.url), html)
console.log(`${codes.length} codes, versions ${Math.min(...codes.map((c) => c.version))} to ${Math.max(...codes.map((c) => c.version))}: vectors/own-photos.json and vectors/own-photos-sheet.html`)
