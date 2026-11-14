# @forgesworn/qr

A QR code encoder for browsers, workers and Node, with no dependencies.
Versions 1-40, all four error correction levels, numeric, alphanumeric and
byte modes, optional UTF-8 ECI, and SVG, canvas and terminal output.

The tests compare 114 symbols module for module with an independent encoder
(ZXing, as a test-time oracle), covering every version and mask, and have an
independent decoder (jsQR) read back random payloads and every renderer's
output. Neither ships in the package.
[SPEC.md](SPEC.md) defines the behaviour exactly, so ports in other
languages can produce identical output.

A decoder is planned and is not in this release.

## Install

```bash
npm install @forgesworn/qr
```

ESM only, Node.js 22.13 or later, or any modern browser.

## Use

```ts
import { drawCanvas, encode, isDark, toSvg, toTerminal } from '@forgesworn/qr'

const qr = encode('https://example.com/', { ecc: 'Q' })
qr.version   // 2
qr.size      // 25 modules per side, quiet zone not included
isDark(qr, 0, 0) // true: the top-left finder

const svg = toSvg(qr, { margin: 4, dark: '#111', light: '#fff', title: 'Link to example.com' })

drawCanvas(document.querySelector('canvas')!, qr, { width: 320 }) // or an OffscreenCanvas
console.log(toTerminal(qr))  // half-block text for a dark terminal; { ink: 'dark' } for a light one
```

`encode(data, options)` takes a string (encoded as UTF-8) or a
`Uint8Array`. Options:

| Option | Default | |
|---|---|---|
| `ecc` | `'M'` | `'L'`, `'M'`, `'Q'` or `'H'` |
| `version` | smallest that fits | 1-40; throws `QrCapacityError` if the data does not fit |
| `minVersion` | 1 | lower bound when choosing a version |
| `mask` | lowest penalty | 0-7 |
| `mode` | most compact | `'numeric'`, `'alphanumeric'` or `'byte'` |
| `eci` | `false` | in byte mode, mark the data as UTF-8 |

The result's `modules` is a row-major `Uint8Array` of `size * size`
entries, 1 for dark, with no quiet zone.

Renderers, each with `margin` (quiet zone in modules, default 4):

- `toSvg(qr, { dark, light, title })`: an SVG string, one path, `light: null` for no background.
- `drawCanvas(canvas, qr, { width, dark, light })`: sizes the canvas to `width` pixels
  square (default 8 per module) with module edges on whole pixels.
- `toTerminal(qr, { ink })`: two rows per line in half blocks; `ink: 'light'` (default)
  for dark terminals, `'dark'` for light ones.

## Development

```bash
npm install
npm run check              # typecheck and tests
npm run build              # compile to dist/
npm run generate-vectors   # regenerate the ZXing vectors (needs a JDK and network once)
```

## Licence

MIT
