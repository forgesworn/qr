import { type QrCode } from './encode.js'

export interface TerminalOptions {
  /** Quiet zone in modules on every side. Default 4, the standard's minimum. */
  margin?: number
  /**
   * Which modules the block characters draw. `'light'` (the default) suits a
   * terminal with a dark background: blocks paint the light modules and the
   * quiet zone, and the background shows through as dark modules. Use
   * `'dark'` on a light background.
   */
  ink?: 'light' | 'dark'
}

const BLOCKS = [' ', '▀', '▄', '█'] // none, upper half, lower half, full

/**
 * Renders a code as text, two module rows per line with half-block
 * characters, one line per row pair and no trailing newline. Needs a
 * monospace font whose block characters fill the cell.
 */
export function toTerminal(qr: QrCode, options: TerminalOptions = {}): string {
  const margin = options.margin ?? 4
  if (!Number.isInteger(margin) || margin < 0) throw new RangeError('Margin must be a whole number of modules')
  const inkIsLight = (options.ink ?? 'light') === 'light'
  const side = qr.size + margin * 2
  const inked = (x: number, y: number): boolean => {
    const mx = x - margin
    const my = y - margin
    const dark = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my * qr.size + mx] === 1
    return dark !== inkIsLight
  }
  const lines: string[] = []
  for (let y = 0; y < side; y += 2) {
    let line = ''
    for (let x = 0; x < side; x++) {
      // An odd side leaves the last line's lower half blank (the terminal background).
      const lower = y + 1 < side && inked(x, y + 1)
      line += BLOCKS[(inked(x, y) ? 1 : 0) | (lower ? 2 : 0)]
    }
    lines.push(line)
  }
  return lines.join('\n')
}
