const supported = new WeakMap()
export const hasSupport = finder => supported.get(finder) === true
export function markSupport(image, edges, counts, y, end, tolerance, finder, ratio) {
  if (supported.get(finder) === true) return
  const x = Math.floor(end - counts[4] - counts[3] - counts[2] / 2)
  const module = (counts[0] + counts[1] + counts[2] + counts[3] + counts[4]) / 7
  const slack = module * tolerance
  const probe = row => {
    // Cropped neighbour evidence is unknown and must retain the sighting.
    if (row < 0 || row >= image.height || x < 0 || x >= image.width) return true
    if (image.data[row * image.width + x] !== 1) return false
    const changes = edges.row(row)
    let lo = 0, hi = changes.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (changes[mid] <= x) lo = mid + 1; else hi = mid }
    const idx = lo
    const boundary = k => k <= 0 ? 0 : k > changes.length ? image.width : changes[k - 1]
    const len = k => boundary(k + 1) - boundary(k)
    const centre = len(idx)
    const centreOk = Math.abs(3 * module - centre) < 3 * slack
    let left = false, right = false
    if (idx >= 2) left = Math.abs(len(idx - 1) - module) < slack && Math.abs(len(idx - 2) - module) < slack
    if (idx + 2 <= changes.length) right = Math.abs(len(idx + 1) - module) < slack && Math.abs(len(idx + 2) - module) < slack
    if (centreOk && (left || right)) return true
    return idx >= 2 && idx + 2 <= changes.length && ratio([len(idx - 2), len(idx - 1), centre, len(idx + 1), len(idx + 2)], tolerance)
  }
  if (probe(y - 1) || probe(y + 1)) supported.set(finder, true)
}
