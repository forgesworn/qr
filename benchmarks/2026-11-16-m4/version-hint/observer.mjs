// Observer only: all callbacks execute the unmodified operation once.
export function observer(truth) {
  const events = [], locations = new WeakMap()
  let scope
  const point = p => ({ x: p.x, y: p.y, moduleSize: p.moduleSize, count: p.count })
  const describe = (p, f) => ({ ...point(p), truthDistances: truth.map(t => Math.hypot(p.x * f - t.x, p.y * f - t.y)) })
  const budget = b => ({ maps: b.maps, here: b.here, second: b.second, invertedFallback: b.invertedFallback, uniform: b.uniform })
  function scoped(kind, meta, fn, queue) {
    if (scope) throw Error('nested read scope')
    const e = { kind, ...meta, stages: [], queueBefore: queue?.length }; scope = e
    try { const result = fn(); e.result = result ? 'success' : 'miss'; e.queueAfter = queue?.length; return result }
    finally { scope = undefined; events.push(e) }
  }
  return {
    look(meta) { events.push({ kind:'look', ...meta }) },
    search(meta, fn) {
      const before = budget(meta.budget), queueBefore = meta.candidates.length
      const result = fn()
      events.push({ kind:'search-end', f:meta.f, inverted:meta.inverted, strict:meta.strict, strictOverride:meta.strictOverride, before, after:budget(meta.budget), queueBefore, queueAfter:meta.candidates.length, result:result ? 'success' : 'miss' })
      return result
    },
    finders({ f, inverted, strict, tolerance, finders, ranked, budget }) {
      events.push({ kind:'finders', f, inverted, strict, tolerance, budget, finders:finders.map(p => describe(p, f)), ranked:ranked.map((triple, rank) => ({ rank, points:triple.map(p => describe(p, f)) })) })
    },
    locate(meta, fn) {
      const result = fn(), triple = meta.triple.map(p => describe(p, meta.f))
      const e = { kind:'locate', ...meta, triple, maps:result.map(l => ({ size:l.size, alignment:l.alignment })) }
      events.push(e)
      for (const location of result) locations.set(location, { triple, delta:meta.delta })
      return result
    },
    estimate(meta) { events.push({ kind:'estimate', ...meta, triple:meta.triple.map(p => describe(p, meta.f)) }) },
    read(meta, fn, candidates) {
      const loc = locations.get(meta.location)
      if (!loc) throw Error('missing location lineage')
      return scoped('read', { f:meta.f, inverted:meta.inverted, strict:meta.strict, tolerance:meta.tolerance, delta:meta.delta, size:meta.location.size, triple:loc.triple, budget:meta.budget }, fn, candidates)
    },
    second(meta, fn) {
      const loc = locations.get(meta.candidate.location)
      if (!loc) throw Error('missing second-look location lineage')
      return scoped('second', { f:meta.f, strict:meta.strict, size:meta.candidate.location.size, inverted:meta.candidate.inverted, mirrored:meta.candidate.mirrored, triple:loc.triple, budget:meta.budget }, fn)
    },
    event(kind, extra = {}) { if (scope) scope.stages.push({ kind, ...extra }); else events.push({ kind, ...extra }) },
    report() { return { truth, events } },
  }
}
