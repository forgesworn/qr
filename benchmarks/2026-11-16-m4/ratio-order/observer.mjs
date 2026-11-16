const orders = { original: [0, 1, 2, 3, 4], centreFirst: [2, 0, 1, 3, 4] }
const fresh = () => ({ calls: 0, zeroChecks: 0, totals: 0, additions: 0, totalGuard: 0, divisions: 0, slackMultiplications: 0, predicates: 0, countLoads: 0, conversions: 0, subtractions: 0, abs: 0, comparisons: 0, centreMultiplications: 0, rejected: {} })
const increment = (o, key) => { o[key] = (o[key] || 0) + 1 }
function predicate(c, module, slack, i) {
  return i === 2 ? Math.abs(3 * module - c[i]) < 3 * slack : Math.abs(module - c[i]) < slack
}
function simulate(c, tolerance, order, tally) {
  tally.calls++
  for (let i = 0; i < 5; i++) { tally.zeroChecks++; if (c[i] === 0) { increment(tally.rejected, `zero${i}`); return false } }
  tally.totals++; tally.additions += 4
  const total = c[0] + c[1] + c[2] + c[3] + c[4]
  tally.totalGuard++
  if (total < 7) { increment(tally.rejected, 'total'); return false }
  tally.divisions++; const module = total / 7
  tally.slackMultiplications++; const slack = module * tolerance
  for (const i of order) {
    tally.predicates++; tally.countLoads++; tally.conversions++; tally.subtractions++; tally.abs++; tally.comparisons++
    if (i === 2) tally.centreMultiplications += 2
    if (!predicate(c, module, slack, i)) { increment(tally.rejected, `component${i}`); return false }
  }
  increment(tally.rejected, 'accepted'); return true
}
export function observer() {
  const groups = {}
  return {
    observe(c, tolerance, stage, authoritative) {
      const key = `${stage}/${tolerance}`
      const group = groups[key] ||= { original: fresh(), centreFirst: fresh(), truthMasks: {}, maskEligible: 0 }
      const a = simulate(c, tolerance, orders.original, group.original)
      const b = simulate(c, tolerance, orders.centreFirst, group.centreFirst)
      if (a !== authoritative || b !== authoritative) throw Error(`ratio disagreement ${key}: ${c}`)
      // Independent diagnostic-only work: evaluates every component after guards.
      if (c.every(v => v !== 0)) {
        const total = c[0] + c[1] + c[2] + c[3] + c[4]
        if (total >= 7) {
          const module = total / 7, slack = module * tolerance
          let mask = 0
          for (let i = 0; i < 5; i++) if (predicate(c, module, slack, i)) mask |= 1 << i
          increment(group.truthMasks, mask); group.maskEligible++
        }
      }
    },
    report() { return { groups } },
  }
}
