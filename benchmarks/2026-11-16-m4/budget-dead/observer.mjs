const fields = ['steps', 'compared', 'scanned', 'maps', 'second', 'meshes', 'probed', 'reduced']
const bump = (object, key, amount = 1) => { object[key] = (object[key] || 0) + amount }
const reason = budget => budget.maps === 0 ? (budget.here === 0 ? 'both' : 'global') : budget.here === 0 ? 'perLook' : 'live'
const workCopy = work => Object.fromEntries(fields.map(k => [k, work?.[k] ?? 0]))
export function observer() {
  const groups = {}, stack = [], queues = new WeakMap()
  const result = { phases: groups, secondAfterDeadSearch: { attempts: 0, looks: 0, queueLengths: {}, reasons: {} } }
  function group(kind, metadata, budget) {
    const why = reason(budget)
    const key = JSON.stringify({ kind, reason: why, inverted: metadata.inverted, strict: metadata.strict, scale: metadata.f, strictOverride: metadata.strictOverride, tolerance: metadata.tolerance, delta: metadata.delta })
    return groups[key] ||= { kind, reason: why, metadata: { inverted: metadata.inverted, strict: metadata.strict, scale: metadata.f, strictOverride: metadata.strictOverride, tolerance: metadata.tolerance, delta: metadata.delta }, entries: 0, entryBudgets: {}, returnedItems: 0, returnedReadings: 0, rowWindows: 0, newEdgeRows: 0, edgePixelsCompared: 0, workDelta: Object.fromEntries(fields.map(k => [k, 0])), queueAtEntry: {}, queueAtReturn: {} }
  }
  return {
    phase(kind, metadata, budget, work, fn) {
      const g = group(kind, metadata, budget), before = workCopy(work), why = reason(budget)
      g.entries++; bump(g.entryBudgets, `${budget.maps}/${budget.here}`)
      if (kind === 'search') {
        bump(g.queueAtEntry, metadata.candidates.length)
        if (why !== 'live') {
          let q = queues.get(metadata.candidates)
          if (!q) { q = { reasons: new Set(), secondRecorded: false }; queues.set(metadata.candidates, q) }
          q.reasons.add(why)
        }
      }
      stack.push(g)
      try {
        const value = fn()
        if (Array.isArray(value)) g.returnedItems += value.length
        else if (value !== undefined) g.returnedReadings++
        return value
      } finally {
        if (stack.pop() !== g) throw Error('phase stack mismatch')
        for (const k of fields) g.workDelta[k] += (work?.[k] ?? 0) - before[k]
        if (kind === 'search') bump(g.queueAtReturn, metadata.candidates.length)
      }
    },
    event(kind, metadata, budget) { const g = group(kind, metadata, budget); g.entries++; bump(g.entryBudgets, `${budget.maps}/${budget.here}`) },
    edge(width) { for (const g of stack) { g.newEdgeRows++; g.edgePixelsCompared += Math.max(0, width - 1) } },
    rowWindow() { for (const g of stack) g.rowWindows++ },
    second(candidates, budget, metadata) {
      const q = queues.get(candidates); if (!q) return
      const s = result.secondAfterDeadSearch; s.attempts++
      if (!q.secondRecorded) { q.secondRecorded = true; s.looks++; bump(s.queueLengths, candidates.length); for (const why of q.reasons) bump(s.reasons, why) }
    },
    report() { if (stack.length) throw Error('unfinished phase'); return result },
  }
}
