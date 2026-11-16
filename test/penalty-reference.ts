// Literal scorer retained from 91dd037 as an independent optimisation oracle.
/** Mask penalty per ISO/IEC 18004 section 7.8.3, scoring the finished symbol. */
export function referencePenalty(modules: Uint8Array, size: number): number {
  let score = 0
  let dark = 0
  for (let y = 0; y < size; y++) {
    let rowRun = 0
    let colRun = 0
    for (let x = 0; x < size; x++) {
      const here = modules[y * size + x]!
      dark += here
      if (x > 0 && here === modules[y * size + x - 1]) rowRun++
      else {
        if (rowRun >= 5) score += rowRun - 2
        rowRun = 1
      }
      const down = modules[x * size + y]!
      if (x > 0 && down === modules[(x - 1) * size + y]) colRun++
      else {
        if (colRun >= 5) score += colRun - 2
        colRun = 1
      }
      if (x < size - 1 && y < size - 1) {
        if (
          here === modules[y * size + x + 1] &&
          here === modules[(y + 1) * size + x] &&
          here === modules[(y + 1) * size + x + 1]
        ) score += 3
      }
      if (x + 6 < size && finderLike(modules, size, x, y, 1, 0)) score += 40
      if (x + 6 < size && finderLike(modules, size, y, x, 0, 1)) score += 40
    }
    if (rowRun >= 5) score += rowRun - 2
    if (colRun >= 5) score += colRun - 2
  }
  const total = size * size
  score += Math.floor((Math.abs(dark * 2 - total) * 10) / total) * 10
  return score
}

const FINDER_RUN = [1, 0, 1, 1, 1, 0, 1]

/** 1:1:3:1:1 starting at (x, y) along (dx, dy), with four light modules on one side. */
function finderLike(m: Uint8Array, size: number, x: number, y: number, dx: number, dy: number): boolean {
  for (let i = 0; i < 7; i++) if (m[(y + i * dy) * size + x + i * dx] !== FINDER_RUN[i]) return false
  return lightRun(m, size, x, y, dx, dy, -4) || lightRun(m, size, x, y, dx, dy, 7)
}

/**
 * Four modules from offset `from` along the line are light. A run that would
 * leave the symbol does not count: the quiet zone is not scored. The reference
 * encoder scores it the same way, which keeps mask choice identical to it.
 */
function lightRun(m: Uint8Array, size: number, x: number, y: number, dx: number, dy: number, from: number): boolean {
  for (let i = from; i < from + 4; i++) {
    const px = x + i * dx
    const py = y + i * dy
    if (px < 0 || py < 0 || px >= size || py >= size) return false
    if (m[py * size + px] === 1) return false
  }
  return true
}
