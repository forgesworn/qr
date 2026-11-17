#!/usr/bin/env python3
"""Copy ROOT/src to a new OUTSRC and add diagnostic-only starvation observers.

Usage: python3 instrument.py ROOT OUTSRC
No compiler or decoder is invoked. The caller owns transpilation and execution.
"""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    root, dest = map(lambda value: pathlib.Path(value).resolve(), sys.argv[1:])
    source = root / 'src'
    if dest.exists() or dest == source or source in dest.parents:
        raise SystemExit('OUTSRC must be a new directory outside ROOT/src')
    original = {str(p.relative_to(source)): p.read_bytes() for p in sorted(source.rglob('*')) if p.is_file()}
    text = original['decode.ts'].decode()
    replacements = []

    def replace(old, new, count=1):
        nonlocal text
        actual = text.count(old)
        if actual != count:
            raise RuntimeError(f'Expected {count} occurrences, found {actual}: {old[:160]!r}')
        text = text.replace(old, new)
        replacements.append({'needle': old, 'count': count})

    replace('import { agreedVersion, readSymbol, curvatureHeader,', 'import { agreedVersion, readVersion, readSymbol, curvatureHeader,')
    replace('const MAX_TRIPLES = 6', HELPERS + '\nconst MAX_TRIPLES = 6')
    replace('  const { width, height, stride, channels, inversion } = imageLayout(image, options)',
            '  __diagReset()\n  const { width, height, stride, channels, inversion } = imageLayout(image, options)')
    replace('  return recoverMeshGrids(budget)\n}', '''  const meshResult = recoverMeshGrids(budget)
  __diagFinish(luminance, inverse, budget, inverseCurvature, !meshResult)
  return meshResult
}''')
    look_signature = "function look(luminance: Luminance, inversion: 'both' | 'normal' | 'inverted', f: number, budget: Budget, work?: Work, strictOverride = false, inverseCurvature?: Candidate[], publicInverse = false): DecodeResult | undefined {"
    replace(look_signature, look_signature + "\n  __diagContext = { phase: strictOverride ? 'inverse-search' : 'search', factor: f, basis: publicInverse ? 'inverse-luminance' : 'original' }")
    for function, phase in [('recoverVersion', 'version'), ('recoverOverflow', 'overflow')]:
        signature = f'function {function}(luminance: Luminance, budget: Budget, work?: Work): DecodeResult | undefined {{'
        replace(signature, signature + f"\n  __diagContext = {{ phase: '{phase}', factor: 1, basis: 'original' }}")
    signature = 'function recoverCurvature(luminance: Luminance, budget: Budget, work?: Work, candidates = budget.curvature, publicInverse = false): DecodeResult | undefined {'
    replace(signature, signature + "\n  __diagContext = { phase: 'curvature', factor: 1, basis: publicInverse ? 'inverse-luminance' : 'original' }")
    replace('  const { size, project, matrix } = location\n', '''  const { size, project, matrix } = location
  if (__diagHook) {
    // Independent reads: never populate or mutate the production module cache.
    const at: ModuleReader = (x, y) => {
      const p = project(x, y), px = Math.floor(p.x), py = Math.floor(p.y)
      return px >= 0 && py >= 0 && px < image.width && py < image.height && image.data[py * image.width + px] === 1
    }
    __diagEmit({ kind: 'map-evidence', ...__diagContext, size, inverted,
      publicInverted: __diagContext.basis === 'inverse-luminance' || inverted,
      matrix: matrix ? Array.from(matrix) : undefined,
      finders: [location.topLeft, location.topRight, location.bottomLeft].map(p => ({x:p.x,y:p.y})),
      version: readVersion(at, size) ?? null,
      mirroredVersion: readVersion((x,y) => at(y,x), size) ?? null })
  }
''')
    replace('keep(candidates, { location, inverted, ...agreed })', '__diagKeep(candidates, { location, inverted, ...agreed }, \'ordinary\')')
    replace('    if (!duplicate) keep(candidates, { location, inverted, mirrored, ...header })', '''    if (!duplicate) __diagKeep(candidates, { location, inverted, mirrored, ...header }, 'curvature')
    else if (__diagHook) __diagEmit({ kind: 'duplicate', queue: 'curvature', candidate: __diagCandidate({ location, inverted, mirrored, ...header }) })''')
    calls = [
        ('secondLook(luminance, levels, candidate, work, strict, false, meshCollector(budget, candidate, f, publicInverse))', 'strict', 'false', 1),
        ('secondLook(luminance, levels, candidate, work, true, false, meshCollector(budget, candidate, 1))', 'true', 'false', 2),
        ('secondLook(luminance, levels, candidate, work, true, true, meshCollector(budget, candidate, 1, publicInverse))', 'true', 'true', 1),
    ]
    for call, strict, late, count in calls:
        replace('    const result = ' + call,
                f'    __diagAttempt(candidate, {strict}, {late}, budget)\n    const result = ' + call, count)

    # Verify input bytes remain stable before creating any output.
    for name, data in original.items():
        if (source / name).read_bytes() != data:
            raise RuntimeError(f'Source changed during preparation: {name}')
    dest.mkdir(parents=True)
    for name, data in original.items():
        out = dest / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(text.encode() if name == 'decode.ts' else data)
    identity = {
        'diagnostic': 'single-unattempted-curvature-replay',
        'root': str(root),
        'revision': subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip(),
        'instrumentSha256': sha(pathlib.Path(__file__).read_bytes()),
        'sourceFiles': {name: sha(data) for name, data in original.items()},
        'copiedFiles': {name: sha((dest / name).read_bytes()) for name in original},
        'replacements': replacements,
        'selection': 'original curvature queue then inverse queue; retained order; first semantic key never attempted; independent of expected payload',
        'replayLimit': 1,
        'work': 'baseline untouched; replay separate; diagnostic header reads uncounted',
    }
    (dest / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    print(json.dumps({'source': str(dest), 'identity': str(dest / 'identity.json'), 'decodeSha256': sha(text.encode())}))


HELPERS = r'''
// Diagnostic-only state. No source API or packaged decoder is changed.
type DiagnosticContext = { phase: string; factor: number; basis: 'original' | 'inverse-luminance' }
type DiagnosticHook = (event: unknown) => void
let __diagHook: DiagnosticHook | undefined
let __diagContext: DiagnosticContext = { phase: 'start', factor: 1, basis: 'original' }
let __diagAttempted = new Set<string>()
let __diagLateAttempted = new Set<string>()
let __diagPending: { candidate: Candidate; luminance: Luminance; context: DiagnosticContext } | undefined

function __diagReset(): void {
  __diagPending = undefined
  __diagAttempted = new Set<string>()
  __diagLateAttempted = new Set<string>()
  __diagHook = (globalThis as typeof globalThis & { __qrStarvationTrace?: DiagnosticHook }).__qrStarvationTrace
  __diagContext = { phase: 'start', factor: 1, basis: 'original' }
}

function __diagEmit(event: unknown): void {
  if (__diagHook) __diagHook(event)
}

function __diagCandidate(candidate: Candidate, context = __diagContext) {
  const { location, mirrored, inverted, ecc, mask, distance } = candidate
  const size = location.size
  const numbers = (values: readonly number[]) => values.map(v => Number.isFinite(v) ? Object.is(v, -0) ? '-0' : String(v) : String(v))
  const matrix = location.matrix ? Array.from(location.matrix) : undefined
  // A homography is identified by its complete coefficient array. Non-matrix
  // fallback maps use a fixed 3x3 projected landmark grid, including the centre.
  const landmarks = matrix ? undefined : [0, (size - 1) / 2, size - 1].flatMap(y =>
    [0, (size - 1) / 2, size - 1].map(x => { const p = location.project(x,y); return {x:p.x,y:p.y} }))
  const geometry = matrix ? ['matrix', numbers(matrix)] : ['landmarks', landmarks!.map(p => numbers([p.x,p.y]))]
  const key = JSON.stringify([context.basis, context.factor, size, mirrored, inverted, ecc, mask, geometry])
  return { key, ...context, size, mirrored, inverted, publicInverted: context.basis === 'inverse-luminance' || inverted,
    ecc, mask, distance, matrix, landmarks,
    finders: [location.topLeft,location.topRight,location.bottomLeft].map(p => ({x:p.x,y:p.y})) }
}

function __diagKeep(list: Candidate[], candidate: Candidate, queue: string): void {
  if (!__diagHook) { keep(list, candidate); return }
  const before = list.slice()
  keep(list, candidate)
  __diagEmit({ kind: 'admission', queue, candidate: __diagCandidate(candidate),
    retained: list.includes(candidate), index: list.indexOf(candidate),
    evicted: before.filter(c => !list.includes(c)).map(c => __diagCandidate(c)),
    exactVersionHeaderQualified: queue === 'curvature',
    retainedQueue: list.map(c => __diagCandidate(c)) })
}

function __diagAttempt(candidate: Candidate, strict: boolean, late: boolean, budget: Budget): void {
  if (!__diagHook) return
  const item = __diagCandidate(candidate)
  __diagAttempted.add(item.key)
  if (late) __diagLateAttempted.add(item.key)
  __diagEmit({ kind: 'second-attempt', candidate: item, strict, late,
    remainingSecond: budget.second, remainingMaps: budget.maps })
}

function __diagFinish(luminance: Luminance, inverse: Luminance | undefined, budget: Budget, inverseQueue: Candidate[] | undefined, failed: boolean): void {
  if (!__diagHook) return
  const queues = [
    { list: budget.curvature, luminance, basis: 'original' as const },
    { list: inverseQueue ?? [], luminance: inverse, basis: 'inverse-luminance' as const },
  ]
  const retained: unknown[] = []
  for (const queue of queues) {
    const context: DiagnosticContext = { phase: 'curvature', factor: 1, basis: queue.basis }
    for (const candidate of queue.list) {
      const item = __diagCandidate(candidate, context), attempted = __diagAttempted.has(item.key)
      const lateAttempted = __diagLateAttempted.has(item.key)
      retained.push({ ...item, attempted, lateAttempted, ordinaryOnly: attempted && !lateAttempted, exactVersionHeaderQualified: true })
      if (failed && !attempted && !__diagPending && queue.luminance) __diagPending = { candidate, luminance: queue.luminance, context }
    }
  }
  __diagEmit({ kind: 'final-retained', failed, remainingSecond: budget.second, remainingMaps: budget.maps,
    retained, selectedKey: __diagPending ? __diagCandidate(__diagPending.candidate, __diagPending.context).key : null })
}

/** One privileged, separately counted diagnostic attempt after a failed decode. */
export function __qrReplayStarved() {
  const pending = __diagPending
  __diagPending = undefined
  if (!pending) return undefined
  const { candidate, luminance, context } = pending
  const work: Work = { steps:0, compared:0, scanned:0, maps:0, second:1, meshes:0, probed:0, reduced:0 }
  let grid: Uint8Array | undefined
  const payload = secondLook(luminance, thresholds(luminance), candidate, work, true, true, modules => { grid = modules })
  let result: DecodeResult | undefined
  let meshRead = false
  const publicInverted = context.basis === 'inverse-luminance' || candidate.inverted
  if (payload) result = { ...payload, mirrored:candidate.mirrored, inverted:publicInverted, location:where(candidate.location,1) }
  else if (grid) {
    meshRead = true
    const modules = grid, size = candidate.location.size
    const read: ModuleReader = candidate.mirrored ? (x,y) => modules[x*size+y] === 1 : (x,y) => modules[y*size+x] === 1
    if (formatAgrees(read,size,candidate.ecc,candidate.mask)) {
      const readPayload = readSymbol(read,size)
      if (readPayload && readPayload.ecc === candidate.ecc && readPayload.mask === candidate.mask)
        result = { ...readPayload, mirrored:candidate.mirrored, inverted:publicInverted, location:where(candidate.location,1) }
    }
  }
  return { attempted:true, candidate:__diagCandidate(candidate,context), result, work, meshRead }
}
'''


if __name__ == '__main__':
    main()
