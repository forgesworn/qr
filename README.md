# @forgesworn/qr

A QR code encoder for browsers, workers and Node, with no dependencies.
Versions 1-40, all four error correction levels, numeric, alphanumeric and
byte modes, optional UTF-8 ECI, and SVG output.

Every symbol it makes is checked byte for byte against an independent
encoder (ZXing, as a test-time oracle) across all versions and masks, and
read back by an independent decoder (jsQR). Neither ships in the package.
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
import { encode, toSvg, isDark } from '@forgesworn/qr'

const qr = encode('https://example.com/', { ecc: 'Q' })
qr.version   // 2
qr.size      // 25 modules per side, quiet zone not included
isDark(qr, 0, 0) // true: the top-left finder

const svg = toSvg(qr, { margin: 4, dark: '#111', light: '#fff', title: 'Link to example.com' })
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
entries, 1 for dark, for drawing on a canvas or anywhere else.

## Development

```bash
npm install
npm run check              # typecheck and tests
npm run build              # compile to dist/
npm run generate-vectors   # regenerate the ZXing vectors (needs a JDK and network once)
```

## Licence

MIT
