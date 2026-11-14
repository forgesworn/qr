import { type QrCode } from './encode.js'

/** The slice of a 2D context the renderer uses, so it needs no DOM types. */
export interface Canvas2dLike {
  fillStyle: unknown
  fillRect(x: number, y: number, width: number, height: number): void
}

/** An `HTMLCanvasElement`, an `OffscreenCanvas`, or anything shaped like one. */
export interface CanvasLike {
  width: number
  height: number
  getContext(type: '2d'): Canvas2dLike | null
}

export interface CanvasOptions {
  /** Width and height of the canvas in pixels. Default 8 pixels per module. */
  width?: number
  /** Quiet zone in modules on every side. Default 4, the standard's minimum. */
  margin?: number
  /** Colour of dark modules. Default `'#000'`. */
  dark?: string
  /** Background colour, or `null` to leave the canvas transparent. Default `'#fff'`. */
  light?: string | null
}

/**
 * Draws a code onto a canvas, resizing it to `width` square and replacing
 * whatever it held. Module edges fall on whole pixels, so nothing is
 * anti-aliased; when `width` is not a multiple of the module count, modules
 * differ in size by at most one pixel.
 */
export function drawCanvas(canvas: CanvasLike, qr: QrCode, options: CanvasOptions = {}): void {
  const margin = options.margin ?? 4
  if (!Number.isInteger(margin) || margin < 0) throw new RangeError('Margin must be a whole number of modules')
  const side = qr.size + margin * 2
  const width = options.width ?? side * 8
  if (!Number.isInteger(width) || width < side) {
    throw new RangeError(`Width must be a whole number of pixels, at least ${side} for this code`)
  }
  canvas.width = width
  canvas.height = width
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('The canvas has no 2D context')
  const light = options.light === undefined ? '#fff' : options.light
  const edge = (module: number) => Math.round((module * width) / side)
  if (light !== null) {
    context.fillStyle = light
    context.fillRect(0, 0, width, width)
  }
  context.fillStyle = options.dark ?? '#000'
  for (let y = 0; y < qr.size; y++) {
    const top = edge(y + margin)
    const height = edge(y + margin + 1) - top
    let x = 0
    while (x < qr.size) {
      if (qr.modules[y * qr.size + x] !== 1) {
        x++
        continue
      }
      const start = x
      while (x < qr.size && qr.modules[y * qr.size + x] === 1) x++
      const left = edge(start + margin)
      context.fillRect(left, top, edge(x + margin) - left, height)
    }
  }
}
