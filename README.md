# @forgesworn/qr

A QR code encoder and decoder for browsers, workers and Node, with no
dependencies. Versions 1-40, all four error correction levels, numeric,
alphanumeric and byte modes (mixed in one symbol where that saves bits),
optional UTF-8 ECI, and SVG, canvas and terminal output. The decoder reads
a code from camera or screenshot pixels.

The tests compare 148 symbols module for module with an independent encoder,
covering every version and mask and mixed-segment symbols, and have an
independent decoder read back random payloads and every renderer's output.
Both are test-time oracles; neither ships in the package.
[SPEC.md](SPEC.md) defines the behaviour exactly, so ports in other
languages can produce identical output, and [vectors/](vectors/README.md)
holds what a port checks itself against: the encoder's symbols, and for the
decoder each stage, result and work count on a set of pictures.

The decoder tests draw codes through synthetic camera effects (rotation,
perspective, small modules, blur, noise, uneven light, inversion and
mirroring) and require it to read at least as many of those frames as an
independent decoder does. A second set of 184 real photographs, drawn from
open-source test collections and fetched by hash rather than committed, has
a floor on how many are read (179 at present) and a rule that none may
decode to the wrong text.

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
| `mode` | fewest bits | `'numeric'`, `'alphanumeric'` or `'byte'`: the whole text as one segment of that mode |
| `eci` | `false` | when there is a byte segment, mark the data as UTF-8 |

With no `mode`, text is split into the numeric, alphanumeric and byte
segments that take the fewest bits, so a payment URI with a lowercase scheme
and an uppercase body fits a smaller symbol than it would as bytes. A
`Uint8Array` is always one byte segment.

The result's `modules` is a row-major `Uint8Array` of `size * size`
entries, 1 for dark, with no quiet zone. `segments` lists the data segments
in order as `{ mode, count }`, and `mode` is the widest of them. `isDark` is
false outside the symbol.

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
found?.text      // the payload as text
found?.bytes     // the payload as bytes
found?.location  // picture coordinates of the three finders
```

`decode(image, options)` takes `{ data, width, height }` with RGBA or
greyscale bytes and returns `undefined` when it finds no readable code.
Options: `rowStride` (pixels a row, for padded camera planes), `channels`
(1 or 4; worked out from the data length by default, and three bytes a
pixel is refused) and `inversion`
(`'both'` by default, or `'normal'` or `'inverted'`). The result also says
whether the code was `mirrored` or `inverted`, and its `version`, `ecc` and
`mask`.

`text` follows the symbol's ECI when it has one. Without one, byte data is
UTF-8 when it is valid UTF-8, Shift_JIS when it has the shape of Shift_JIS
text, and Latin-1 otherwise; kanji and hanzi segments read as text. `bytes`
is there
for payloads that are not text. `structuredAppend` (`{ index, total,
parity }`) is present when the code is one part of a split message, and
`fnc1` when it carries an FNC1 indicator (GS1 and industry formats);
[SPEC.md](SPEC.md) has the detail.

The decoder is built to return nothing rather than a wrong text: a block
that needed more corrections than the standard allows is refused, and the
tests require damaged symbols to read as nothing or as exactly what was
written. When the first search of a frame reads nothing, the decoder looks
again at up to four placements whose two format copies agree, and then at
the picture shrunk by 8, 4 and 2, where a read counts only if both format
copies agree with it.

A frame with no code in it costs more than one with a code; on a 1280x720
frame of pure noise, expect a few hundred milliseconds on a laptop, so
throttle camera loops.

`decodeModules(modules, size)` reads a module grid you already have.

## Kotlin

A pure-JVM port of the encoder and decoder lives in `kotlin/` (module `core`,
package `dev.forgesworn.qr`, JVM 17, no dependencies beyond the Kotlin standard
library). It is checked against the same vectors and frames as the TypeScript
library. The sources are in `kotlin/core/src/main/kotlin` and are written to be
vendored as they stand.

```kotlin
import dev.forgesworn.qr.*

val qr = encode("https://example.com", EncodeOptions(ecc = ErrorCorrection.Q))
qr.isDark(0, 0) // modules are row by row, no quiet zone

// luminance: one byte a pixel, 0 black to 255 white, as a camera's Y plane gives
val found = decode(luminance, width, height, rowStride = stride)
found?.text
```

`decode` returns `null` when it finds no readable code. There is also a
`decode(IntArray, ...)` overload for packed ARGB pixels and
`decodeModules(modules, size)` for a module grid. Run the tests with
`cd kotlin && ./gradlew test`.

## Development

```bash
npm install
npm run check              # typecheck and tests
npm run build              # compile to dist/
npm run generate-vectors   # regenerate the encode vectors (needs a JDK and network once)
npm run fetch-photos       # download the photograph test set (about 13 MB, needs a JDK)
```

## Support

For issues and feature requests, see [GitHub Issues](https://github.com/forgesworn/qr/issues).

If you find this library useful, consider sending a tip:

- **Lightning:** `profusemeat89@walletofsatoshi.com`
- **Nostr zaps:** `npub1mgvlrnf5hm9yf0n5mf9nqmvarhvxkc6remu5ec3vf8r0txqkuk7su0e7q2`

## Licence

MIT
