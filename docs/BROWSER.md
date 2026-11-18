# Generate and read QR codes in a browser with TypeScript

`@forgesworn/qr` generates standard QR codes and reads them from canvas,
uploaded images or camera frames. It runs locally with no runtime dependencies.
It reads one QR Code Model 2 symbol per call. Your application provides the
camera interface and the pixels.

## Try it

The demo reads a small, faint QR code from the
[conformance pack](../vectors/conformance/contrast-thresholds-dark.png),
or an image you choose. Images you choose stay in the browser. The demo
scales down images whose longest side exceeds 1,600 pixels.

<!-- demo controls -->

## Generate a code and read it back

Add the package to an existing browser project with a bundler.

```sh
npm install @forgesworn/qr
```

Add a canvas to the page.

```html
<canvas id="qr" aria-label="Example QR code"></canvas>
```

Run this in your TypeScript entry point.

```ts
import { decode, drawCanvas, encode } from '@forgesworn/qr'

const canvas = document.querySelector<HTMLCanvasElement>('#qr')!
const text = 'https://example.com/qr-demo'
drawCanvas(canvas, encode(text))

const context = canvas.getContext('2d')!
const frame = context.getImageData(0, 0, canvas.width, canvas.height)
const result = decode(frame)
console.assert(result?.text === text)
```

Use `toSvg(encode(text))` when you need a standalone SVG string. The library
adds a four-module quiet zone to the renderers by default.

## Read a camera frame

Use a reusable decoder for successive frames. Pass a video element that is
already playing and a scratch canvas. Call `scanFrame` a few times a second,
and call `scanner.reset()` when you switch cameras.

```ts
import { createDecoder } from '@forgesworn/qr'

const scanner = createDecoder()

function scanFrame(video: HTMLVideoElement, scratch: HTMLCanvasElement) {
  const { videoWidth: width, videoHeight: height } = video
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !width || !height) return
  if (scratch.width !== width) scratch.width = width
  if (scratch.height !== height) scratch.height = height

  const context = scratch.getContext('2d', { willReadFrequently: true })!
  context.drawImage(video, 0, 0, width, height)
  return scanner.decode(context.getImageData(0, 0, width, height))
}
```

The result includes text, bytes and location, or is `undefined` when no code
reads. For a complete camera example with permission handling and cleanup,
see the [camera recipe](../README.md#scan-with-the-camera).

## Migrate from jsQR

`jsQR(rgba, width, height)?.data` becomes
`decode({ data: rgba, width, height })?.text`. Use `result.bytes` for the raw
payload. See the [migration guide](../README.md#migrating-from-another-library)
for option and position differences. Use the
[comparison and fit guide](CHOOSING.md) if you also need other barcode formats.
