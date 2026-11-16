// Shadow-only fixed surrounding-ring test. Original decoding always runs.
export function observer() {
  const finders = new WeakMap(), locations = new WeakMap()
  const reasons = {}, stages = {}, successes = []
  const totals = { setupPixelReads: 0, sightings: 0, rankedTriples: 0, rankedUnsupported: 0, locateCalls: 0, unsupportedLocateCalls: 0, scanned: 0, unsupportedScanned: 0, emittedMaps: 0, unsupportedEmittedMaps: 0, readMaps: 0, unsupportedReadMaps: 0 }
  const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n }
  function states(triple) { return triple.map(f => { const s = finders.get(f); if (!s) throw Error('missing finder provenance'); return s.retain ? (s.supported ? 'supported' : 'unknown') : 'unsupported' }) }
  function supported(triple) { return states(triple).every(s => s !== 'unsupported') }
  function flood(name, side, start, accepts, connectivity, retainedBytes = 0) {
    const n = side * side, seen = new Uint8Array(n), queue = new Int32Array(n)
    const st = stages[name] ||= { calls: 0, examined: 0, neighbourProbes: 0, pushes: 0, pops: 0, peakQueue: 0, peakLogicalBytes: 0, allocatedLogicalBytes: 0 }
    st.calls++; st.allocatedLogicalBytes += n * 5; st.peakLogicalBytes = Math.max(st.peakLogicalBytes, n * 5 + retainedBytes)
    let head = 0, tail = 0, top = start
    if (start < 0 || start >= n) throw Error('flood start out of bounds')
    seen[start] = 1; queue[tail++] = start; st.pushes++
    const dirs = connectivity === 4 ? [[1,0],[-1,0],[0,1],[0,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
    while (head < tail) {
      st.peakQueue = Math.max(st.peakQueue, tail - head)
      const i = queue[head++], x = i % side, y = Math.floor(i / side); st.pops++
      if (y < Math.floor(top / side)) top = i
      if (x === 0 || y === 0 || x === side - 1 || y === side - 1) return { escaped: true, seen, top }
      for (const [dx, dy] of dirs) {
        st.neighbourProbes++
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= side || ny >= side) continue
        const j = ny * side + nx
        if (seen[j]) continue
        st.examined++
        if (accepts(j)) { seen[j] = 1; if (j < 0 || j >= n || tail >= n) throw Error('flood queue invariant'); queue[tail++] = j; st.pushes++ }
      }
    }
    return { escaped: false, seen, top }
  }
  return {
    sighting(image, cx, cy, moduleSize) {
      totals.sightings++
      const x = Math.floor(cx), y = Math.floor(cy), radius = Math.ceil(4 * moduleSize)
      let reason
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(radius) || radius < 0 || x - radius < 0 || y - radius < 0 || x + radius >= image.width || y + radius >= image.height) reason = 'unknown-clipped'
      else if ((totals.setupPixelReads++, image.data[y * image.width + x] !== 1)) reason = 'unknown-light-centre'
      else {
        const side = 2 * radius + 1, n = side * side, left = x - radius, top = y - radius
        if (!Number.isSafeInteger(n) || n > 0x7fffffff) throw Error('window too large for diagnostic queue')
        const pixel = i => image.data[(top + Math.floor(i / side)) * image.width + left + i % side]
        const centre = radius * side + radius
        const dark = flood('dark4', side, centre, i => pixel(i) === 1, 4)
        if (dark.escaped) reason = 'unsupported-dark-escape'
        else {
          const whiteStart = dark.top - side
          dark.seen = null
          totals.setupPixelReads++
          if (pixel(whiteStart) === 1) throw Error('topmost component has dark pixel above')
          const white = flood('light8', side, whiteStart, i => pixel(i) !== 1, 8)
          if (white.escaped) reason = 'unsupported-light-escape'
          else {
            const outer = flood('complement4', side, centre, i => !white.seen[i], 4, n)
            reason = outer.escaped ? 'unsupported-not-enclosing' : 'supported'
          }
        }
      }
      bump(reasons, reason)
      return reason
    },
    link(finder, reason) {
      let s = finders.get(finder)
      if (!s) { s = { retain: false, supported: false }; finders.set(finder, s) }
      if (reason === 'supported') s.supported = true
      if (!reason.startsWith('unsupported-')) s.retain = true
    },
    finalFinders(list) { for (const f of list) { const s = finders.get(f); if (!s) throw Error('missing finder provenance'); bump(totals, s.supported ? 'finalSupportedFinders' : s.retain ? 'finalUnknownFinders' : 'finalUnsupportedFinders') } },
    ranked(triples) { for (const triple of triples) { totals.rankedTriples++; if (!supported(triple)) totals.rankedUnsupported++ } },
    locate(triple, work, fn) {
      const ok = supported(triple), before = work?.scanned || 0
      totals.locateCalls++; if (!ok) totals.unsupportedLocateCalls++
      const result = fn(), area = (work?.scanned || 0) - before
      totals.scanned += area; totals.emittedMaps += result.length
      if (!ok) { totals.unsupportedScanned += area; totals.unsupportedEmittedMaps += result.length }
      for (const location of result) locations.set(location, triple)
      return result
    },
    map(location) { const t = locations.get(location); if (!t) throw Error('missing map provenance'); totals.readMaps++; if (!supported(t)) totals.unsupportedReadMaps++ },
    success(location, kind) { const t = locations.get(location); if (!t) throw Error('missing successful location provenance'); successes.push({ kind, supported: supported(t), finderStates: states(t) }) },
    report() { return { reasons, stages, totals, successes } },
  }
}

// Invoked on the execution host before the 38 fixture decodes.
export function selfTest() {
  const make = () => {
    const data = new Uint8Array(81)
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) data[y * 9 + x] = 1
    for (let i = 1; i <= 7; i++) { data[9 + i] = 1; data[7 * 9 + i] = 1; data[i * 9 + 1] = 1; data[i * 9 + 7] = 1 }
    return { data, width: 9, height: 9 }
  }
  const test = (image, x, y, want) => { const got = observer().sighting(image, x, y, 1); if (got !== want) throw Error(`ring self-test ${want}: ${got}`) }
  test(make(), 4, 4, 'supported')
  { const a = make(); a.data[9 + 4] = 0; test(a, 4, 4, 'unsupported-light-escape') }
  { const a = make(); a.data[9 + 1] = 0; test(a, 4, 4, 'unsupported-light-escape') }
  { const a = make(); a.data[2 * 9 + 2] = 1; a.data[0] = 1; test(a, 4, 4, 'supported') }
  test(make(), 0, 4, 'unknown-clipped')
  { const a = make(); for (let y = 0; y <= 3; y++) a.data[y * 9 + 4] = 1; test(a, 4, 4, 'unsupported-dark-escape') }
}
