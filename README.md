# @forgesworn/qr

A QR code encoder and decoder for browsers, workers and Node, with no
dependencies. Versions 1-40, all four error correction levels, numeric,
alphanumeric and byte modes, optional UTF-8 ECI, and SVG, canvas and
terminal output. The decoder reads a code from camera or screenshot pixels.

The tests compare 114 symbols module for module with an independent encoder
(ZXing, as a test-time oracle), covering every version and mask, and have an
independent decoder (jsQR) read back random payloads and every renderer's
output. Neither ships in the package.
[SPEC.md](SPEC.md) defines the behaviour exactly, so ports in other
languages can produce identical output.

The decoder tests draw codes through synthetic camera effects (rotation,
perspective, small modules, blur, noise, uneven light, inversion and
mirroring) and require it to read at least as many of those frames as jsQR
does. They are synthetic; real phone photographs are not yet part of the
test set.

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

### Reading

```ts
import { decode } from '@forgesworn/qr'

const frame = ctx.getImageData(0, 0, width, height) // RGBA, as a canvas gives
const found = decode(frame)
found?.text      // the payload as text: UTF-8 when it is valid UTF-8, else Latin-1, unless an ECI says
found?.bytes     // the raw bytes
found?.location  // picture coordinates of the three finders
```

`decode(image, options)` takes `{ data, width, height }` with RGBA or
greyscale bytes and returns `undefined` when it finds no readable code.
Options: `rowStride` (pixels a row, for padded camera planes), `channels`
(1 or 4; worked out from the data length by default) and `inversion`
(`'both'` by default, or `'normal'` or `'inverted'`). The result also says
whether the code was `mirrored` or `inverted`, and its `version`, `ecc` and
`mask`. Kanji segments are kept as bytes and show as U+FFFD in `text`. A frame with no code in it costs more than one with a code; on a
1280x720 frame of pure noise, expect a few hundred milliseconds on a
laptop, so throttle camera loops.

`decodeModules(modules, size)` reads a module grid you already have.

## Development

```bash
npm install
npm run check              # typecheck and tests
npm run build              # compile to dist/
npm run generate-vectors   # regenerate the ZXing vectors (needs a JDK and network once)
```

## Licence

MIT
