// Shadow bookkeeping only: baseline result and candidate order remain authoritative.
export function observer() {
  const states = new WeakMap()
  const stats = {
    contexts: 0, queries: 0, candidatesInserted: 0, blocksCreated: 0,
    cumulativeBoundsBytes: 0, cumulativeEstimatedBytesWithFlag: 0,
    peakBlocksPerContext: 0, peakBoundsBytesPerContext: 0, peakEstimatedBytesWithFlagPerContext: 0,
    insertionFiniteChecks: 0, insertionExtremaUpdates: 0,
    queryRadiusFiniteChecks: 0, queryRadiusNonnegativeChecks: 0, queryCoordinateFiniteChecks: 0,
    blockVisits: 0, blockValidityChecks: 0, blocksSkipped: 0, blocksReplayed: 0, blocksNotVisitedAfterMatch: 0,
    boundOrderChecks: 0, boundDistanceChecks: 0,
    baselinePoints: 0, baselineX: 0, baselineY: 0, baselineDistance: 0,
    shadowPoints: 0, shadowX: 0, shadowY: 0, shadowDistance: 0,
    duplicateQueries: 0, queriesThroughFirstDuplicate: 0,
    baselinePointsThroughFirstDuplicate: 0, shadowPointsThroughFirstDuplicate: 0,
    blockVisitsThroughFirstDuplicate: 0, boundChecksThroughFirstDuplicate: 0,
  }
  let firstDuplicate = false
  function matches(a, p, radius, distance, prefix) {
    stats[prefix + 'Points']++; stats[prefix + 'X']++
    if (!(Math.abs(a.p.x - p.x) <= radius)) return false
    stats[prefix + 'Y']++
    if (!(Math.abs(a.p.y - p.y) <= radius)) return false
    stats[prefix + 'Distance']++
    return distance(a.p, p) <= radius
  }
  function outside(block, p, radius) {
    // Each distance uses exactly the stored point/extremum minus query order.
    stats.boundOrderChecks++
    if (block.minX > p.x) { stats.boundDistanceChecks++; if (Math.abs(block.minX - p.x) > radius) return true }
    stats.boundOrderChecks++
    if (block.maxX < p.x) { stats.boundDistanceChecks++; if (Math.abs(block.maxX - p.x) > radius) return true }
    stats.boundOrderChecks++
    if (block.minY > p.y) { stats.boundDistanceChecks++; if (Math.abs(block.minY - p.y) > radius) return true }
    stats.boundOrderChecks++
    if (block.maxY < p.y) { stats.boundDistanceChecks++; if (Math.abs(block.maxY - p.y) > radius) return true }
    return false
  }
  return {
    start(scored) { if (states.has(scored)) throw Error('duplicate context'); states.set(scored, []); stats.contexts++ },
    insert(scored, p) {
      const blocks = states.get(scored); if (!blocks) throw Error('missing context')
      const index = scored.length - 1
      const previousEnd = blocks.length ? blocks[blocks.length - 1].end : 0
      if (index !== previousEnd || index < 0 || scored[index].p !== p) throw Error('insertion mismatch')
      stats.candidatesInserted++; stats.insertionFiniteChecks++
      let valid = Number.isFinite(p.x)
      if (valid) { stats.insertionFiniteChecks++; valid = Number.isFinite(p.y) }
      let b = blocks[blocks.length - 1]
      if (!b || b.end - b.start === 8) {
        b = { start: index, end: index + 1, minX: p.x, maxX: p.x, minY: p.y, maxY: p.y, valid }
        blocks.push(b); stats.blocksCreated++; stats.cumulativeBoundsBytes += 32; stats.cumulativeEstimatedBytesWithFlag += 40
        stats.peakBlocksPerContext = Math.max(stats.peakBlocksPerContext, blocks.length)
        stats.peakBoundsBytesPerContext = Math.max(stats.peakBoundsBytesPerContext, blocks.length * 32)
        stats.peakEstimatedBytesWithFlagPerContext = Math.max(stats.peakEstimatedBytesWithFlagPerContext, blocks.length * 40)
      } else {
        if (b.end !== index) throw Error('noncontiguous block')
        b.end++; b.valid = b.valid && valid; stats.insertionExtremaUpdates += 4
        b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x)
        b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y)
      }
    },
    query(scored, p, radius, distance) {
      const blocks = states.get(scored); if (!blocks) throw Error('missing context')
      const end = blocks.length ? blocks[blocks.length - 1].end : 0
      if (end !== scored.length || blocks.length !== Math.ceil(scored.length / 8)) throw Error('block coverage mismatch')
      stats.queries++
      const before = { bp: stats.baselinePoints, sp: stats.shadowPoints, bv: stats.blockVisits, bc: stats.boundOrderChecks + stats.boundDistanceChecks }
      let original = -1
      for (let i = 0; i < scored.length; i++) if (matches(scored[i], p, radius, distance, 'baseline')) { original = i; break }
      stats.queryRadiusFiniteChecks++
      const finiteRadius = Number.isFinite(radius)
      let validQuery = finiteRadius
      if (finiteRadius) { stats.queryRadiusNonnegativeChecks++; validQuery = radius >= 0 }
      if (validQuery) { stats.queryCoordinateFiniteChecks++; validQuery = Number.isFinite(p.x) }
      if (validQuery) { stats.queryCoordinateFiniteChecks++; validQuery = Number.isFinite(p.y) }
      let shadow = -1
      for (const [blockIndex, b] of blocks.entries()) {
        stats.blockVisits++
        let skip = false
        if (validQuery) { stats.blockValidityChecks++; if (b.valid) skip = outside(b, p, radius) }
        if (skip) { stats.blocksSkipped++; continue }
        stats.blocksReplayed++
        for (let i = b.start; i < b.end; i++) if (matches(scored[i], p, radius, distance, 'shadow')) { shadow = i; break }
        if (shadow >= 0) { stats.blocksNotVisitedAfterMatch += blocks.length - blockIndex - 1; break }
      }
      if (original !== shadow) throw Error(`first duplicate differs: ${original} vs ${shadow}`)
      if (!firstDuplicate) {
        stats.queriesThroughFirstDuplicate++
        stats.baselinePointsThroughFirstDuplicate += stats.baselinePoints - before.bp
        stats.shadowPointsThroughFirstDuplicate += stats.shadowPoints - before.sp
        stats.blockVisitsThroughFirstDuplicate += stats.blockVisits - before.bv
        stats.boundChecksThroughFirstDuplicate += stats.boundOrderChecks + stats.boundDistanceChecks - before.bc
      }
      if (original >= 0) { stats.duplicateQueries++; firstDuplicate = true }
      return original >= 0
    },
    report() {
      const guards = stats.insertionFiniteChecks + stats.queryRadiusFiniteChecks + stats.queryRadiusNonnegativeChecks + stats.queryCoordinateFiniteChecks + stats.blockValidityChecks
      return {
        ...stats,
        baselinePointsAvoided: stats.baselinePoints - stats.shadowPoints,
        baselineXYChecks: stats.baselineX + stats.baselineY,
        shadowXYChecks: stats.shadowX + stats.shadowY,
        chargedValidityGuards: guards,
        chargedBoundsChecks: stats.boundOrderChecks + stats.boundDistanceChecks,
        chargedShadowScalarOperations: stats.shadowX + stats.shadowY + stats.boundOrderChecks + stats.boundDistanceChecks + guards + stats.insertionExtremaUpdates,
      }
    },
  }
}
