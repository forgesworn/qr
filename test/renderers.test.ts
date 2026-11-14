import jsQRModule from 'jsqr'
import { describe, expect, it } from 'vitest'
import { drawCanvas, encode, toTerminal, type CanvasLike, type QrCode } from '../src/index.js'

const jsQR = jsQRModule as unknown as typeof jsQRModule.default

/** A canvas that rasterises fillRect into RGBA, refusing fractional edges. */
class FakeCanvas implements CanvasLike {
  width = 1
  height = 1
  pixels = new Uint8ClampedArray(4)
  getContext(): { fillStyle: unknown; fillRect(x: number, y: number, w: number, h: number): void } {
    this.pixels = new Uint8ClampedArray(this.width * this.height * 4)
    const canvas = this
    return {
      fillStyle: '#000' as unknown,
      fillRect(x: number, y: number, w: number, h: number) {
        for (const v of [x, y, w, h]) if (!Number.isInteger(v)) throw new Error(`fractional edge ${v}`)
        const grey = this.fillStyle === '#fff' ? 255 : 0
        for (let py = y; py < y + h; py++) {
          for (let px = x; px < x + w; px++) {
            const p = (py * canvas.width + px) * 4
            canvas.pixels[p] = canvas.pixels[p + 1] = canvas.pixels[p + 2] = grey
            canvas.pixels[p + 3] = 255
          }
        }
      },
    }
  }
}

const text = 'https://example.com/j/#' + 'x'.repeat(120) // throwaway
const decodeCanvas = (c: FakeCanvas) =>
  jsQR(c.pixels, c.width, c.height, { inversionAttempts: 'dontInvert' })?.data

describe('drawCanvas', () => {
  it('fills the requested width exactly and reads back', () => {
    const qr = encode(text)
    for (const width of [320, 480, qr.size + 8, 8 * (qr.size + 8)]) {
      const canvas = new FakeCanvas()
      drawCanvas(canvas, qr, { width })
      expect([canvas.width, canvas.height]).toEqual([width, width])
      if (width >= 3 * (qr.size + 8)) expect(decodeCanvas(canvas)).toBe(text)
    }
  })

  it('paints the background unless asked not to', () => {
    const qr = encode('a')
    const canvas = new FakeCanvas()
    drawCanvas(canvas, qr, { width: 100 })
    expect(canvas.pixels[3]).toBe(255) // top-left is quiet zone, painted light
    drawCanvas(canvas, qr, { width: 100, light: null })
    expect(canvas.pixels[3]).toBe(0)
  })

  it('rejects widths too small or fractional, and bad margins', () => {
    const qr = encode('a') // 21 modules + 8 quiet = 29
    expect(() => drawCanvas(new FakeCanvas(), qr, { width: 28 })).toThrow(RangeError)
    expect(() => drawCanvas(new FakeCanvas(), qr, { width: 100.5 })).toThrow(RangeError)
    expect(() => drawCanvas(new FakeCanvas(), qr, { margin: -1 })).toThrow(RangeError)
    expect(() => drawCanvas({ width: 0, height: 0, getContext: () => null }, qr)).toThrow(/2D context/)
  })
})

/** Reads half-block text back into a grid of inked cells. */
function unblock(art: string, side: number): boolean[][] {
  const grid: boolean[][] = Array.from({ length: side }, () => Array<boolean>(side).fill(false))
  art.split('\n').forEach((line, row) => {
    ;[...line].forEach((ch, x) => {
      const code = ' ▀▄█'.indexOf(ch)
      expect(code).toBeGreaterThanOrEqual(0)
      if (code & 1) grid[row * 2]![x] = true
      if (code & 2 && row * 2 + 1 < side) grid[row * 2 + 1]![x] = true
    })
  })
  return grid
}

function expectRoundTrip(qr: QrCode, margin: number, ink: 'light' | 'dark') {
  const side = qr.size + margin * 2
  const art = toTerminal(qr, { margin, ink })
  const lines = art.split('\n')
  expect(lines).toHaveLength(Math.ceil(side / 2))
  for (const line of lines) expect([...line]).toHaveLength(side)
  const grid = unblock(art, side)
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const inside = x >= margin && y >= margin && x < margin + qr.size && y < margin + qr.size
      const dark = inside && qr.modules[(y - margin) * qr.size + (x - margin)] === 1
      expect(grid[y]![x]).toBe(ink === 'light' ? !dark : dark)
    }
  }
}

describe('toTerminal', () => {
  it('draws every module, for both inks and odd and even sides', () => {
    const qr = encode(text)
    for (const margin of [0, 1, 2, 4]) {
      expectRoundTrip(qr, margin, 'light')
      expectRoundTrip(qr, margin, 'dark')
    }
  })

  it('has no trailing newline and rejects bad margins', () => {
    expect(toTerminal(encode('a')).endsWith('\n')).toBe(false)
    expect(() => toTerminal(encode('a'), { margin: 1.5 })).toThrow(RangeError)
  })
})
