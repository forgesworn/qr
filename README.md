# @forgesworn/qr

Make and read QR codes in TypeScript, with no dependencies. One small
package encodes text or bytes into a symbol, renders it as SVG, canvas or
terminal text, and decodes symbols from camera frames, screenshots and
photographs. It runs in browsers, workers and Node.

```ts
import { decode, encode, toSvg } from '@forgesworn/qr'

const svg = toSvg(encode('https://example.com/'))        // make one
const text = decode(ctx.getImageData(0, 0, w, h))?.text  // read one
```

- **Encoder:** versions 1-40, levels L/M/Q/H, and the smallest symbol for
  your text: numeric, alphanumeric and byte segments are mixed where that
  saves bits.
- **Renderers:** an SVG string, any canvas, or half-block text for a
  terminal.
- **Decoder:** takes RGBA or greyscale pixels and reads codes that are
  rotated, tilted, mirrored, light on dark, curved or close up. It returns
  the text, the raw bytes and where the code is.
- **Careful by design:** the decoder is built to return nothing rather than
  a wrong text, which matters for payment links and sign-in codes.
- **Small and plain:** no runtime dependencies, ESM with types, tree
  shaking. WebAssembly is available through a separate optional import.
- **Portable:** Kotlin and Rust ports are in this repository, checked
  against the same vectors, and [SPEC.md](SPEC.md) with
  [test vectors](vectors/README.md) lets other languages match it exactly.

## Contents

- [Install](#install)
- [Recipes: making codes](#recipes-making-codes)
- [Recipes: reading codes](#recipes-reading-codes)
- [API](#api)
- [Common mistakes](#common-mistakes)
- [Migrating from another library](#migrating-from-another-library)
- [How the decoder works](#how-the-decoder-works)
- [How it is tested](#how-it-is-tested)
- [Kotlin](#kotlin)
- [Rust and WebAssembly](#rust-and-webassembly)
- [Development](#development)

## Install

```bash
npm install @forgesworn/qr
```

ESM only (`import`, not `require`). Node.js 22.13 or later, or any browser
with ES2022 modules. Types are included. The API is still pre-1.0, so pin
the version; changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Recipes: making codes

Every recipe is complete: copy it, change the text, and it runs.
`encode` is synchronous and returns a plain object; the renderers turn
that object into something to show.

### An SVG in the page

```ts
import { encode, toSvg } from '@forgesworn/qr'

const qr = encode('https://example.com/')
const svg = toSvg(qr, { title: 'Link to example.com' })

document.querySelector('#qr')!.innerHTML = svg
```

The SVG has a `viewBox` and no fixed size, so it fills its container: size
it with CSS. `title` becomes the accessible name. As an image source:

```ts
import { encode, toSvg } from '@forgesworn/qr'

const img = document.querySelector('img')!
img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(toSvg(encode('https://example.com/')))
```

### A canvas, and a PNG to download

```ts
import { drawCanvas, encode } from '@forgesworn/qr'

const canvas = document.querySelector('canvas')!
drawCanvas(canvas, encode('https://example.com/'), { width: 512 })

canvas.toBlob((png) => {
  if (!png) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(png)
  link.download = 'code.png'
  link.click()
})
```

`drawCanvas` resizes the canvas to exactly `width` pixels square and puts
module edges on whole pixels. `width` must be a whole number of at least
one pixel a module, margin included, or it throws a `RangeError`. It takes
an `OffscreenCanvas` too.

### A terminal, or a file, from Node

```ts
import { writeFileSync } from 'node:fs'
import { encode, toSvg, toTerminal } from '@forgesworn/qr'

const qr = encode('https://example.com/')
console.log(toTerminal(qr))                  // dark terminal; { ink: 'dark' } for a light one
writeFileSync('code.svg', toSvg(qr))
```

### Colours, margin and error correction

```ts
import { encode, toSvg } from '@forgesworn/qr'

const qr = encode('https://example.com/', { ecc: 'H' })   // 'L' | 'M' (default) | 'Q' | 'H'
const svg = toSvg(qr, { dark: '#1a1a2e', light: null, margin: 2 })   // light: null leaves the background clear
```

A higher level survives more damage and makes a larger symbol. Keep the
`margin` at 4 modules unless the code sits on a plain background already;
readers need the quiet zone.

### Your own drawing

`modules` is a row-by-row `Uint8Array` of `size * size` entries, 1 for
dark, with no quiet zone. `isDark(qr, x, y)` reads it, and is `false`
outside the symbol.

```ts
import { encode, isDark } from '@forgesworn/qr'

const qr = encode('https://example.com/')
let dots = ''
for (let y = 0; y < qr.size; y++) {
  for (let x = 0; x < qr.size; x++) {
    if (isDark(qr, x, y)) dots += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.45"/>`
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${qr.size + 8} ${qr.size + 8}">${dots}</svg>`
```

### The smallest code for a payment link

With no `mode`, text is split into the segments that take the fewest bits.
An uppercase body after a lowercase scheme packs as alphanumeric, so it
fits a smaller symbol than it would as bytes.

```ts
import { encode } from '@forgesworn/qr'

const invoice = 'lightning:LNBC' + '0123456789ACDEFGHJKLMNPQRSTUVWXYZ'.repeat(8)   // 278 characters, made up
const qr = encode(invoice)
qr.segments   // [{ mode: 'byte', count: 9 }, { mode: 'alphanumeric', count: 269 }]
qr.version    // 10, 57 modules a side; as bytes it would be version 12, 65 a side
```

### Bytes, not text

```ts
import { encode } from '@forgesworn/qr'

const qr = encode(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))   // always one byte segment
```

### When the data does not fit

```ts
import { encode, QrCapacityError, type ErrorCorrection, type QrCode } from '@forgesworn/qr'

/** The most robust code that still fits, or undefined if none does. */
function fit(text: string): QrCode | undefined {
  for (const ecc of ['H', 'Q', 'M', 'L'] as ErrorCorrection[]) {
    try {
      return encode(text, { ecc })
    } catch (error) {
      if (!(error instanceof QrCapacityError)) throw error
    }
  }
  return undefined
}
```

`QrCapacityError` extends `RangeError`. Bad options (a version outside
1-40, an unknown level) throw a plain `RangeError`, and data that is
neither a string nor a `Uint8Array` throws a `TypeError`.

## Recipes: reading codes

`decode` takes pixels, not an element: `{ data, width, height }` with RGBA
(what a canvas gives) or one grey byte a pixel. It returns the result, or
`undefined` when it finds no code it is sure of. It manages no camera; the
loop below is all there is to it.

### Scan with the camera

```ts
import { decode } from '@forgesworn/qr'

/** Starts scanning; calls `onRead` once with the first code read. Returns a function that stops the camera. */
async function scan(video: HTMLVideoElement, onRead: (text: string) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  video.srcObject = stream
  video.playsInline = true
  await video.play()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  let running = true
  let last = 0

  const stop = () => {
    running = false
    for (const track of stream.getTracks()) track.stop()
  }
  const tick = (now: number) => {
    if (!running) return
    if (now - last >= 100 && video.videoWidth > 0) {   // ten looks a second is plenty
      last = now
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
      const found = decode(ctx.getImageData(0, 0, canvas.width, canvas.height))
      if (found) {
        stop()
        onRead(found.text)
        return
      }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return stop
}

const stop = await scan(document.querySelector('video')!, (text) => console.log(text))
```

Cameras need a secure page (HTTPS or localhost) and the user's permission.
A 1280x720 frame is enough for most codes; a larger one only costs time.

### Read an uploaded picture or a screenshot

```ts
import { decode } from '@forgesworn/qr'

async function readFile(file: Blob): Promise<string | undefined> {
  const bitmap = await createImageBitmap(file)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  return decode(ctx.getImageData(0, 0, bitmap.width, bitmap.height))?.text
}

document.querySelector('input[type=file]')!.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) console.log((await readFile(file)) ?? 'no code found')
})
```

### Keep the page smooth: decode in a worker

```ts
// main.ts
const worker = new Worker(new URL('./scan-worker.ts', import.meta.url), { type: 'module' })
worker.onmessage = (event: MessageEvent<string | undefined>) => {
  if (event.data !== undefined) console.log(event.data)
}

function look(frame: ImageData): void {
  worker.postMessage(frame, [frame.data.buffer])   // moves the pixels, no copy
}
```

```ts
// scan-worker.ts
import { decode } from '@forgesworn/qr'

addEventListener('message', (event: MessageEvent<ImageData>) => {
  postMessage(decode(event.data)?.text)
})
```

Most bundlers understand `new Worker(new URL(...), { type: 'module' })`
as written. Send the next frame only when the last has answered, so frames
do not queue.

### Read pixels in Node

Node has no image decoder of its own. Use any that gives raw RGBA or grey
bytes, and hand them over with their size:

```ts
import { decode } from '@forgesworn/qr'

function read(rgba: Uint8Array, width: number, height: number): string | undefined {
  return decode({ data: rgba, width, height })?.text
}
```

### Greyscale camera planes

A camera's luminance (Y) plane is already what the decoder wants, and
skips the colour conversion. `rowStride` is the number of pixels from one
row to the next, for planes with padding.

```ts
import { decode } from '@forgesworn/qr'

function readPlane(y: Uint8Array, width: number, height: number, rowStride: number): string | undefined {
  return decode({ data: y, width, height }, { channels: 1, rowStride })?.text
}
```

The data must hold at least `rowStride * (height - 1) + width` bytes, and
`rowStride` may not be less than `width`. A Node `Buffer` is a `Uint8Array`
and works as it is. `decode` copies what it needs: it neither changes your
buffer nor keeps it.

### Repeated camera frames

Use an independent decoder for each camera stream:

```ts
import { createDecoder, type ImageLike } from '@forgesworn/qr'

const reader = createDecoder()
function readFrame(frame: ImageLike) {
  return reader.decode(frame) // the same image and options as decode()
}
reader.reset()               // call when stopping or switching cameras
```

It reuses luminance storage and tries the previous symbol's region first.
When that region misses, it searches the full frame in the same call. Each
call reads fresh pixels; it never returns a cached payload. With several codes
visible, it favours the previous region. Cropping can change the reported
location slightly. `reset()` forgets the region and releases working storage.
Keep using a worker and avoid queueing frames, as in the recipe above.

### Everything a read gives you

```ts
import { decode, type DecodeResult, type ImageLike } from '@forgesworn/qr'

function describe(frame: ImageLike): string {
  const found: DecodeResult | undefined = decode(frame)
  if (!found) return 'nothing read'

  const { topLeft, topRight, bottomLeft } = found.location   // finder pattern centres, in pixels
  const width = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y)
  const height = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y)
  return [
    `text: ${found.text}`,
    `bytes: ${found.bytes.length}`,                           // the payload as stored, for data that is not text
    `version ${found.version}, level ${found.ecc}, ${found.corrected} codewords corrected`,
    found.inverted ? 'light on dark' : 'dark on light',
    found.mirrored ? 'mirrored' : 'not mirrored',
    `about ${Math.round(width)} by ${Math.round(height)} pixels between finders`,
  ].join('\n')
}
```

The three points of `location` are the centres of the finder patterns,
each 3.5 modules in from a corner of the symbol, so the symbol's outline
lies a little outside them. `alignment` is the alignment pattern's centre
when one was used.

`found.structuredAppend` (`{ index, total, parity }`) is present when the
code is one part of a message split across several, and `found.fnc1` when
it is a GS1 or industry code.

### Only dark-on-light codes

```ts
import { decode, type ImageLike } from '@forgesworn/qr'

const readNormal = (frame: ImageLike) => decode(frame, { inversion: 'normal' })   // 'inverted' | 'both' (default)
```

Naming the polarity halves the work on frames with no code.

### Check a code you just made

```ts
import { decodeModules, encode } from '@forgesworn/qr'

const qr = encode('https://example.com/')
console.assert(decodeModules(qr.modules, qr.size)?.text === 'https://example.com/')
```

## API

Everything the package exports:

```ts
function encode(data: string | Uint8Array, options?: EncodeOptions): QrCode
function isDark(qr: QrCode, x: number, y: number): boolean
function toSvg(qr: QrCode, options?: SvgOptions): string
function drawCanvas(canvas: CanvasLike, qr: QrCode, options?: CanvasOptions): void
function toTerminal(qr: QrCode, options?: TerminalOptions): string
function decode(image: ImageLike, options?: DecodeOptions): DecodeResult | undefined
function createDecoder(): Decoder
function decodeModules(modules: ArrayLike<number | boolean>, size: number): (Payload & { mirrored: boolean }) | undefined
class QrCapacityError extends RangeError {}

type ErrorCorrection = 'L' | 'M' | 'Q' | 'H'
type Mode = 'numeric' | 'alphanumeric' | 'byte'

interface EncodeOptions {
  ecc?: ErrorCorrection   // default 'M'
  version?: number        // 1-40; default: the smallest that fits
  minVersion?: number     // default 1
  mask?: number           // 0-7; default: the lowest penalty
  mode?: Mode             // the whole text as one segment; default: the fewest-bits mix
  eci?: boolean           // mark byte data as UTF-8; default false
}

interface QrCode {
  version: number
  ecc: ErrorCorrection
  mask: number
  mode: Mode                                // the widest mode among the segments
  segments: readonly { mode: Mode; count: number }[]
  size: number                              // modules a side, 17 + 4 * version, no quiet zone
  modules: Uint8Array                       // size * size, row by row, 1 for dark
}

interface SvgOptions { margin?: number; dark?: string; light?: string | null; title?: string }
/** An HTMLCanvasElement, an OffscreenCanvas, or anything shaped like one. */
interface CanvasLike { width: number; height: number; getContext(type: '2d'): { fillStyle: unknown; fillRect(x: number, y: number, width: number, height: number): void } | null }
interface CanvasOptions { width?: number; margin?: number; dark?: string; light?: string | null }
interface TerminalOptions { margin?: number; ink?: 'light' | 'dark' }

interface ImageLike { data: Uint8Array | Uint8ClampedArray; width: number; height: number }
interface Decoder {
  decode(image: ImageLike, options?: DecodeOptions): DecodeResult | undefined
  reset(): void
}
interface DecodeOptions {
  rowStride?: number                        // pixels from row to row; default width
  channels?: 1 | 4                          // default: worked out from the data length
  inversion?: 'normal' | 'inverted' | 'both'   // default 'both'
}

interface Payload {
  text: string
  bytes: Uint8Array
  version: number
  ecc: ErrorCorrection
  mask: number
  eci: readonly number[]                    // ECI assignments in the order met
  corrected: number                         // codewords error correction put right
  structuredAppend?: { index: number; total: number; parity: number }
  fnc1?: { position: 'first' | 'second'; applicationIndicator?: string }
}
interface DecodeResult extends Payload {
  mirrored: boolean
  inverted: boolean
  location: { topLeft: Point; topRight: Point; bottomLeft: Point; alignment: Point | undefined }
}
interface Point { x: number; y: number }
```

Defaults worth knowing: `margin` is 4 modules everywhere; `dark` is
`'#000'` and `light` is `'#fff'`; a canvas is 8 pixels a module unless
`width` says otherwise.

**Text.** A string is encoded as UTF-8. When reading, `text` follows the
symbol's ECI if it has one; under an ECI the platform cannot read, what
cannot be read is U+FFFD and never a guess. Without one, byte data is UTF-8 when it is
valid UTF-8, Shift_JIS when it has the shape of Shift_JIS text, and Latin-1
otherwise; kanji and hanzi segments read as text. `bytes` is there for
payloads that are not text. [SPEC.md](SPEC.md) has the detail.

**What `decode` throws.** Nothing for a picture with no code: that is
`undefined`. It throws `TypeError` or `RangeError` only for arguments that
cannot be a picture: data that is not a `Uint8Array` or
`Uint8ClampedArray`, a size that does not match the data, or three bytes a
pixel (pass RGBA or grey).

**Wrong text.** The decoder refuses a block that needed more corrections
than the standard allows, and holds its later, harder searches of a frame
to a stricter check than the first. The tests require damaged symbols to
read as nothing or as exactly what was written.

**Speed.** On the machine the project is measured on, a 1280x720 RGBA
frame takes about 4 ms with a clean code in it and 5 to 7 ms with none. A
frame of pure noise is the worst case at over 100 ms, so scan a few times a
second, not every frame. Phones are slower; a worker keeps the page
smooth either way.

## Common mistakes

- **`require('@forgesworn/qr')`:** the package is ESM only. Use `import`.
- **Passing an `<img>` or `<video>` to `decode`:** draw it to a canvas and
  pass `getImageData(...)`, as the recipes do.
- **Expecting `null`:** `decode` and `decodeModules` return `undefined`
  when nothing reads.
- **`isDark(qr, row, column)`:** the order is `x` then `y`, column then row.
- **Awaiting `encode`:** it is synchronous and returns the code directly.
- **Expecting an element from `toSvg`:** it returns a string.
- **No quiet zone in your own drawing:** `modules` has none; add 4 modules
  of margin, as the renderers do.
- **Three bytes a pixel:** RGB without alpha is refused. Convert to RGBA
  or grey first.
- **Scanning every animation frame:** it works, and wastes battery.
  Throttle as the camera recipe does.

## Migrating from another library

The shapes are close to what most QR libraries use, so a switch is mostly
renaming. Three differences apply whatever you come from: this package is
ESM only, every call is synchronous, and a failed read is `undefined`.

### From `qrcode` (generating)

| `qrcode` | `@forgesworn/qr` |
|---|---|
| `await QRCode.toString(text, { type: 'svg' })` | `toSvg(encode(text))` |
| `await QRCode.toCanvas(canvas, text, { width })` | `drawCanvas(canvas, encode(text), { width })` |
| `await QRCode.toDataURL(text)` | draw to a canvas, then `canvas.toDataURL()`; or an SVG data URL (see the SVG recipe) |
| `await QRCode.toString(text, { type: 'terminal' })` | `toTerminal(encode(text))` |
| `QRCode.create(text)` | `encode(text)` |
| `errorCorrectionLevel: 'M'` | `ecc: 'M'`, on `encode` |
| `version`, `maskPattern` | `version`, `mask`, on `encode` |
| `margin`, `color: { dark, light }` | `margin`, `dark`, `light`, on the renderer |
| `scale` | `width` on `drawCanvas`; an SVG scales with CSS |
| `qr.modules.get(row, col)` | `isDark(qr, col, row)` |
| `qr.modules.size` | `qr.size` |

```ts
// before
import QRCode from 'qrcode'
const svg = await QRCode.toString('https://example.com/', { type: 'svg', errorCorrectionLevel: 'Q', margin: 2 })

// after
import { encode, toSvg } from '@forgesworn/qr'
const svg = toSvg(encode('https://example.com/', { ecc: 'Q' }), { margin: 2 })
```

Options split in two: what goes into the symbol (`ecc`, `version`, `mask`)
belongs to `encode`, and how it looks (`margin`, colours, size) to the
renderer. There is no PNG or file writer; a canvas or the SVG string covers
both.

### From `qrcode-generator` (generating)

| `qrcode-generator` | `@forgesworn/qr` |
|---|---|
| `const qr = qrcode(0, 'M'); qr.addData(text); qr.make()` | `const qr = encode(text, { ecc: 'M' })` |
| `qrcode(typeNumber, level)` with a fixed type number | `encode(text, { version: typeNumber, ecc: level })` |
| `qr.getModuleCount()` | `qr.size` |
| `qr.isDark(row, col)` | `isDark(qr, col, row)` |
| `qr.createSvgTag()` | `toSvg(qr)` |
| `qr.createDataURL()` | an SVG data URL (see the SVG recipe) |
| `qr.addData(text, 'Alphanumeric')` | `encode(text, { mode: 'alphanumeric' })`, or no `mode` and let it choose |

### From `jsQR` (reading)

| `jsQR` | `@forgesworn/qr` |
|---|---|
| `jsQR(imageData.data, imageData.width, imageData.height)` | `decode(imageData)` |
| `{ inversionAttempts: 'dontInvert' }` | `{ inversion: 'normal' }` |
| `{ inversionAttempts: 'onlyInvert' }` | `{ inversion: 'inverted' }` |
| `{ inversionAttempts: 'attemptBoth' }` | `{ inversion: 'both' }`, the default |
| `null` when nothing reads | `undefined` |
| `code.data` | `found.text` |
| `code.binaryData` (number array) | `found.bytes` (`Uint8Array`) |
| `code.version` | `found.version` |
| `code.location.topLeftFinderPattern` and the other two | `found.location.topLeft`, `.topRight`, `.bottomLeft` |
| `code.location.topLeftCorner` and the other corners | not given: the location is the finder centres |

```ts
// before
import jsQR from 'jsqr'
const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })
if (code) handle(code.data)

// after
import { decode } from '@forgesworn/qr'
const found = decode(frame, { inversion: 'normal' })
if (found) handle(found.text)
```

### From a scanner that runs the camera for you

Libraries such as `qr-scanner`, `html5-qrcode` and `@zxing/browser` open
the camera, draw a viewfinder and call you back. This package only reads
pixels, so the camera loop becomes yours: the
[camera recipe](#scan-with-the-camera) is the whole of it, about thirty
lines, and the [worker recipe](#keep-the-page-smooth-decode-in-a-worker)
moves the work off the page. In exchange you choose the frame size, the
scan rate and the interface. Formats other than QR codes are not read.

## How the decoder works

For each frame, in order, stopping at the first read:

1. **Greyscale.** RGBA becomes one grey byte a pixel; a grey plane is used
   as it is.
2. **Black and white.** A threshold is taken for every 8 x 8 block from the
   blocks around it, so shadows and uneven light do not swallow the code.
3. **Finder patterns.** Rows are scanned for the 1:1:3:1:1 runs of a finder
   pattern, each sighting checked down its column, back along its row and
   along a diagonal.
4. **Placement.** Three finders that could be the corners of one symbol
   give its size and a perspective map; the alignment pattern refines it.
5. **Reading.** Modules are sampled through the map, the format and
   version are read, and Reed-Solomon corrects the codewords. A block
   needing more corrections than the standard allows is refused.
6. **A second look.** If nothing read, up to four placements whose two
   format copies agree are sampled again more carefully, following curved
   or bent symbols.
7. **Reduced size.** If still nothing, the picture is searched again shrunk
   by 8, 4 and 2, for close-ups and codes shown on screens, with a
   stricter check on what counts as a read.

Steps 3 to 5 run for dark-on-light and then light-on-dark unless
`inversion` names one. The work a frame can take is capped, and there are
no thresholds or effort levels to tune: the frame size, the scan rate and
`inversion` are the controls. [SPEC.md](SPEC.md) gives every step exactly.

## How it is tested

- **The encoder** is compared module for module with an independent
  encoder on 148 symbols covering every version and mask and mixed
  segments, and an independent decoder reads back random payloads and
  every renderer's output. Both are test-time oracles; neither ships.
- **The decoder** reads codes drawn through synthetic camera effects
  (rotation, perspective, small modules, blur, noise, uneven light,
  inversion, mirroring) and must read at least as many of those frames as
  an independent decoder does.
- **Real photographs:** a set of 184 from open-source test collections,
  fetched by hash and not committed, has a floor on how many are read (179
  at present) and a rule that none may decode to the wrong text. A dedicated
  CI job downloads the set and requires the TypeScript and Kotlin tests to
  run; local runs skip it unless the photographs have been fetched.
- **Damage:** several hundred damaged, bent, close-up and empty frames,
  generated from seeds, must read as nothing or as exactly what was
  written.
- **Ports:** [vectors/](vectors/README.md) holds what a port checks itself
  against, a stage at a time; the Kotlin port passes it unchanged.
  CI also compares the WebAssembly decoder's results and options, its
  encoder and the native renderings, and checks that repeated reads release
  their memory.

## Kotlin

A pure-JVM port of the encoder and decoder lives in `kotlin/` (module `core`,
package `dev.forgesworn.qr`, JVM 17, no dependencies beyond the Kotlin standard
library). It is checked against the same vectors and frames as the TypeScript
library, and gives the same results. The sources are in
`kotlin/core/src/main/kotlin` and are written to be vendored as they stand.

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

## Rust and WebAssembly

A Rust port lives in `rust/`: the encoder, the SVG and terminal renderers
and the whole decoder, with no dependencies. It is held to the same
vectors. Beyond them, its decoder was compared with the TypeScript on 603
pictures kept outside this repository, each at four quarter turns: the
same payload, the same location to the last bit and the same counted work
on all 2,412. It is not published as a standalone Rust crate yet.

The npm package includes an optional WebAssembly backend, imported separately
from the TypeScript entry. The module is about 195 kB before compression.
Fetch and instantiate it once, then reuse it for frames:

```ts
import { loadWasm, wasmUrl } from '@forgesworn/qr/wasm'

const response = await fetch(wasmUrl)
if (!response.ok) throw new Error(`QR module: HTTP ${response.status}`)
const qr = await loadWasm(await response.arrayBuffer())
try {
  const symbol = qr.encode('https://example.com/')
  const found = qr.decodeModules(symbol.modules, symbol.size)
  console.log(found?.text)
  // qr.decode(imageData) accepts the same pixels and options as decode().
} finally {
  qr.dispose() // stop using this instance
}
```

In Node, replace the fetch with `readFile(new URL(wasmUrl))` from
`node:fs/promises`. `loadWasm` performs no network or filesystem access. With a
bundler, ensure it copies `new URL('./qr.wasm', import.meta.url)` as an asset,
or supply bytes from your own deployed copy of `@forgesworn/qr/qr.wasm`.
Serve the module from your own origin; no CDN or runtime dependencies are used.

The backend exposes `encode`, `decode`, `decodeModules`, `reset`, `dispose`
and `memoryBytes`. It copies outputs before freeing native result handles,
so earlier results survive later calls and disposal. Each instance reuses an
input allocation; `reset()` frees that allocation and leaves the instance
usable. WebAssembly memory retains its high-water size until the instance is
collected. `dispose()` releases the instance and rejects further operations;
it is safe to call repeatedly. Use one instance per worker and a worker for
camera frames. This backend does not use the TypeScript session's tracked region.

The Rust port carries no character tables. `bytes` is always exact, but
`text` holds less than in the other ports: a kanji character is U+FFFD,
and so is every byte it cannot read under an ECI it has no decoder for
(the ASCII survives under the single-byte sets), and hanzi-mode symbols are
refused. Read `bytes` and the ECI yourself where the character set matters.

```bash
cd rust
cargo test                                               # the conformance pack and the encoder vectors
cargo build --release --target wasm32-unknown-unknown    # the WebAssembly module
```

`rust/bench/` also holds the scripts that compare the module with the
TypeScript and time it.

## Development

```bash
npm install
npm run check              # typecheck and tests
npm run build              # compile to dist/ and verify/copy the bundled WASM
npm run generate-vectors   # regenerate the encode vectors (needs a JDK and network once)
npm run fetch-photos       # download the photograph test set (about 13 MB, needs a JDK)
```

The checked-in WASM asset is built from this repository's Rust sources with
Rust 1.94.1. Install that toolchain and its `wasm32-unknown-unknown` target,
then use `npm run build:wasm` after changing Rust. `npm run check:wasm`
rebuilds and compares the exact bytes and provenance; CI does this on Linux.
Normal npm builds need no Rust toolchain. `npm run check:package` installs a
real packed tarball into a temporary consumer and checks both entries.
`npm run bench` runs the local benchmark; [PERFORMANCE.md](PERFORMANCE.md)
records the method, measurements and their limits.

[SPEC.md](SPEC.md) defines the behaviour; a change to behaviour changes it
in the same commit.

## Support

For issues and feature requests, see [GitHub Issues](https://github.com/forgesworn/qr/issues).

If you find this library useful, consider sending a tip:

- **Lightning:** `profusemeat89@walletofsatoshi.com`
- **Nostr zaps:** `npub1mgvlrnf5hm9yf0n5mf9nqmvarhvxkc6remu5ec3vf8r0txqkuk7su0e7q2`

## Licence

MIT

QR Code is a registered trademark of DENSO WAVE INCORPORATED.
