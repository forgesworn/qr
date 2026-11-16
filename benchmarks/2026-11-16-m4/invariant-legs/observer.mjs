import { createHash } from 'node:crypto'

// Diagnostic only: the original ray always executes. Contexts are scoped by
// image and the exact triple array created by this search, never coordinates.
export function observer() {
  const images = new WeakMap(), trace = createHash('sha256')
  const counts = {}, phases = {}, stops = {}, groups = {}
  let active, current, nextId = 0, outsideRays = 0, events = 0
  const inc = (obj, key, amount = 1) => { obj[key] = (obj[key] || 0) + amount }
  const bits = value => { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, value); return b.getBigUint64(0).toString(16).padStart(16, '0') }
  const assert = (v, message) => { if (!v) throw new Error('legs observer: ' + message) }
  return {
    phase(image, triple, kind, delta, meta, fn) {
      assert(!active, 'nested phase')
      let triples = images.get(image)
      if (!triples) { triples = new WeakMap(); images.set(image, triples) }
      let entry = triples.get(triple)
      if (!entry) {
        entry = { id: ++nextId, values: [], visits: [], stops: [], points: triple.map(p => [p.x, p.y, p.moduleSize, p.count]) }
        triples.set(triple, entry)
      }
      triple.forEach((p, i) => [p.x, p.y, p.moduleSize, p.count].forEach((n, j) => assert(Object.is(n, entry.points[i][j]), 'triple changed')))
      const group = JSON.stringify({ scale: meta.f, inverted: meta.inverted, strict: meta.strict, tolerance: meta.tolerance, kind, delta })
      inc(phases, group)
      active = { image, triple, kind, delta, entry, ordinal: 0, group }
      try {
        const result = fn()
        assert(active.ordinal === 4 || (kind !== 'over' && active.ordinal === 8), 'unexpected ray count ' + active.ordinal)
        inc(counts, kind + (kind === 'over' ? (result === undefined ? '.undefined' : '.estimated') : (result.length ? '.nonempty' : '.empty')))
        return result
      } finally { active = undefined }
    },
    ray(image, from, to, fn) {
      if (!active) { outsideRays++; return fn() }
      assert(image === active.image && !current, 'image or nesting mismatch')
      const { triple, entry, kind, delta, group } = active
      const pairs = [[triple[0], triple[1]], [triple[1], triple[0]], [triple[0], triple[2]], [triple[2], triple[0]]]
      const ordinal = active.ordinal++, index = ordinal % 4
      assert(from === pairs[index][0] && to === pairs[index][1], 'ray order changed')
      const category = kind === 'over' ? 'over' : kind + (ordinal < 4 ? 'Geometry' : 'Weight')
      current = { visits: 0, runs: [], open: false }
      let result, measured
      try { result = fn(); measured = current } finally { current = undefined }
      assert(measured.runs.length === 2 && !measured.open, 'expected two completed inner runs')
      const signature = JSON.stringify(measured.runs)
      const repeated = Object.hasOwn(entry.values, index)
      if (repeated) {
        assert(Object.is(result, entry.values[index]), 'ray result differs')
        assert(measured.visits === entry.visits[index] && signature === entry.stops[index], 'ray walk differs')
      } else {
        entry.values[index] = result; entry.visits[index] = measured.visits; entry.stops[index] = signature
      }
      inc(counts, category + '.rays'); inc(counts, category + '.pixels', measured.visits)
      if (repeated) { inc(counts, category + '.repeatedRays'); inc(counts, category + '.repeatedPixels', measured.visits) }
      inc(counts, category + (Number.isNaN(result) ? '.nan' : '.number'))
      for (const r of measured.runs) inc(stops, `${category}:${r.reason}:state${r.state}`)
      const g = groups[group] ||= { rays: 0, pixels: 0, repeatedRays: 0, repeatedPixels: 0 }
      g.rays++; g.pixels += measured.visits
      if (repeated) { g.repeatedRays++; g.repeatedPixels += measured.visits }
      trace.update(`${entry.id},${kind},${delta},${ordinal},${bits(result)},${measured.visits},${signature}\n`); events++
      return result
    },
    runStart() { if (current) { assert(!current.open, 'nested run'); current.open = true } },
    pixel() { if (current) { assert(current.open, 'pixel outside run'); current.visits++ } },
    runEnd(reason, state) { if (current) { assert(current.open, 'run not open'); current.open = false; current.runs.push({ reason, state }) } },
    report() { assert(!active && !current, 'unfinished phase'); return { counts, phases, stops, groups, triples: nextId, retainedF64BytesCumulative: nextId * 32, retainedF64BytesPerActiveTriple: nextId ? 32 : 0, outsidePhaseRays: outsideRays, traceEvents: events, traceSha256: trace.digest('hex') } },
  }
}
