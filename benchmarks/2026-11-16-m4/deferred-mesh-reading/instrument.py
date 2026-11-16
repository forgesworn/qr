#!/usr/bin/env python3
"""Copy QR sources and instrument timing identity and refinement stages.

Usage: python3 instrument.py ROOT DEST
DEST must not exist. Events are emitted only when globalThis.__qrTrace is set.
Run __qrStageRead on copied event grids after the real decode, not in its hook.
The two production timing walks are columns and rows, both increasing in k.
No reverse walk or changed timing decision is introduced by this observer.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    if len(sys.argv) not in (3, 4):
        raise ValueError("usage: instrument.py ROOT DEST")
    root, dest = (Path(p).resolve() for p in sys.argv[1:3])
    source = root / "src"
    if dest.exists():
        raise ValueError("destination already exists; choose a new scratch directory")
    if source == dest or source in dest.parents:
        raise ValueError("destination must be outside the source tree")
    original = (source / "refine.ts").read_text()
    modified = original
    replacements = []

    def replace(label, old, new):
        nonlocal modified
        count = modified.count(old)
        if count != 1:
            raise ValueError(f"{label}: expected exactly one source match, found {count}")
        modified = modified.replace(old, new, 1)
        replacements.append(label)

    replace("walk signature",
            "function walk(size: number, along: (k: number) => Point, next: (k: number) => Point, probe: Probe): Float64Array {",
            "function walk(size: number, along: (k: number) => Point, next: (k: number) => Point, probe: Probe, observe?: (event: Record<string, unknown>) => void): Float64Array {")
    replace("walk start",
            "  const measured = new Float64Array(size).fill(NaN)\n  let prior = 0",
            """  const measured = new Float64Array(size).fill(NaN)
  observe?.({ kind: 'walk-start', first: 8, last: size - 9, direction: 1, initialPrior: 0 })
  let prior = 0""")
    replace("walk prior",
            "  for (let k = 8; k <= size - 9; k++) {\n    const p = along(k)",
            """  for (let k = 8; k <= size - 9; k++) {
    const diagnosticPrior = prior
    const p = along(k)""")
    replace("walk no seed",
            "    if (Number.isNaN(seed)) continue",
            """    if (Number.isNaN(seed)) {
      observe?.({ kind: 'walk-step', k, dark, prior: diagnosticPrior, priorAfter: prior,
        p: { x: p.x, y: p.y }, q: { x: q.x, y: q.y }, ux, uy,
        seed: null, a: null, b: null, width: null, offset: null, accepted: false, rejection: 'no-seed' })
      continue
    }""")
    replace("walk rejected width",
            "    if (width < 0.4 || width > 1.6) continue",
            """    if (width < 0.4 || width > 1.6) {
      observe?.({ kind: 'walk-step', k, dark, prior: diagnosticPrior, priorAfter: prior,
        p: { x: p.x, y: p.y }, q: { x: q.x, y: q.y }, ux, uy,
        seed, a, b, width, offset: (a + b) / 2, accepted: false, rejection: 'width' })
      continue
    }""")
    replace("walk accepted offset",
            "    prior = measured[k]!\n  }\n  const out = new Float64Array(size)",
            """    prior = measured[k]!
    observe?.({ kind: 'walk-step', k, dark, prior: diagnosticPrior, priorAfter: prior,
      p: { x: p.x, y: p.y }, q: { x: q.x, y: q.y }, ux, uy,
      seed, a, b, width, offset: measured[k], accepted: true, rejection: null })
  }
  const out = new Float64Array(size)""")
    replace("walk final arrays",
            "  return out\n}\n\n/**\n * Where the colour changes between two module centres",
            """  observe?.({ kind: 'walk-end', first: 8, last: size - 9, direction: 1,
    finalPrior: prior, measured: measured.slice(), offsets: out.slice() })
  return out
}

/**
 * Where the colour changes between two module centres""")
    replace("walk column observer",
            "  const cols = walk(size, (k) => project(k, 6), (k) => project(k + 1, 6), probe)",
            """  const cols = walk(size, (k) => project(k, 6), (k) => project(k + 1, 6), probe,
    observe ? event => observe({ ...event, axis: 'columns', fixedModule: 6 }) : undefined)""")
    replace("walk row observer",
            "  const rows = walk(size, (k) => project(6, k), (k) => project(6, k + 1), probe)",
            """  const rows = walk(size, (k) => project(6, k), (k) => project(6, k + 1), probe,
    observe ? event => observe({ ...event, axis: 'rows', fixedModule: 6 }) : undefined)""")

    replace("mesh signature",
            "function mesh(location: Location, probe: Probe, work?: Work, late = false): Location | undefined {",
            "function mesh(location: Location, probe: Probe, work?: Work, late = false, observe?: (event: Record<string, unknown>) => void): Location | undefined {")
    replace("empty mesh nodes",
            "  if (found === 0) return undefined\n  if (work) work.meshes++",
            """  if (found === 0) {
    if (observe) {
      const originalPoints = c.flatMap(y => c.map(x => project(x, y)))
      observe({ kind: 'nodes', c: Array.from(c), state: state.slice(), ox: ox.slice(), oy: oy.slice(), found,
        originalPoints, bentPoints: originalPoints.map(p => ({ x: p.x, y: p.y })), meshUsable: false })
    }
    return undefined
  }
  if (work) work.meshes++""")
    replace("usable mesh nodes",
            "  return { ...location, project: bent, matrix: undefined }\n}",
            """  if (observe) observe({ kind: 'nodes', c: Array.from(c), state: state.slice(), ox: ox.slice(), oy: oy.slice(), found,
    originalPoints: c.flatMap(y => c.map(x => project(x, y))),
    bentPoints: c.flatMap(y => c.map(x => bent(x, y))), meshUsable: true })
  return { ...location, project: bent, matrix: undefined }
}""")
    replace("second-look start",
            "  const { inverted, mirrored } = candidate\n  const probe = probeFor(image, t, inverted)",
            """  const { inverted, mirrored } = candidate
  const hook = (globalThis as typeof globalThis & { __qrTrace?: (event: Record<string, unknown>) => void }).__qrTrace
  const point = (p: Point) => ({ x: p.x, y: p.y })
  const metadata = hook ? {
    size: candidate.location.size, imageWidth: image.width, imageHeight: image.height, inverted, mirrored, ecc: candidate.ecc, mask: candidate.mask, strict, late,
    candidate: { matrix: candidate.location.matrix ? Array.from(candidate.location.matrix) : undefined,
      topLeft: point(candidate.location.topLeft), topRight: point(candidate.location.topRight),
      bottomLeft: point(candidate.location.bottomLeft),
      alignment: candidate.location.alignment ? point(candidate.location.alignment) : undefined },
  } : undefined
  const observe = hook ? (event: Record<string, unknown>) => hook({ ...metadata, ...event }) : undefined
  observe?.({ kind: 'start' })
  const probe = probeFor(image, t, inverted)""")
    replace("mesh call and diagnostic grid",
            "  const location = mesh(candidate.location, probe, work, late) ?? candidate.location\n  const { size, project } = location",
            """  const location = mesh(candidate.location, probe, work, late, observe) ?? candidate.location
  const { size, project } = location
  if (observe) {
    const points: Point[] = []
    const grid = new Uint8Array(size * size)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const p = project(x, y)
      points.push({ x: p.x, y: p.y })
      grid[y * size + x] = probe(p.x, p.y) > 0 ? 1 : 0
    }
    observe({ kind: 'mesh', points, grid, diagnosticSamples: size * size })
  }""")
    replace("timing snapshot",
            "  for (let i = 0; i < grid.length; i++) grid[i] = probe(centres[i]!.x, centres[i]!.y) > 0 ? 1 : 0",
            """  for (let i = 0; i < grid.length; i++) grid[i] = probe(centres[i]!.x, centres[i]!.y) > 0 ? 1 : 0
  observe?.({ kind: 'timing', points: centres.map(p => ({ x: p.x, y: p.y })), grid: grid.slice(),
    cols: cols.slice(), rows: rows.slice(), diagnosticSamples: 0 })""")
    replace("edge coordinate storage",
            "  const modules = new Uint8Array(size * size)\n  for (let y = 0; y < size; y++) {",
            "  const modules = new Uint8Array(size * size)\n  const diagnosticPoints: Point[] | undefined = observe ? [] : undefined\n  for (let y = 0; y < size; y++) {")
    replace("edge coordinates",
            "      const p = project(x + cols[x]! + dx, y + rows[y]! + dy)\n      modules[y * size + x] = probe(p.x, p.y) > 0 ? 1 : 0",
            """      const p = project(x + cols[x]! + dx, y + rows[y]! + dy)
      diagnosticPoints?.push({ x: p.x, y: p.y })
      modules[y * size + x] = probe(p.x, p.y) > 0 ? 1 : 0""")
    replace("edge snapshot",
            "  const read: ModuleReader = mirrored ? (x, y) => modules[x * size + y] === 1 : (x, y) => modules[y * size + x] === 1",
            """  observe?.({ kind: 'edge', points: diagnosticPoints, grid: modules.slice(), diagnosticSamples: 0 })
  const read: ModuleReader = mirrored ? (x, y) => modules[x * size + y] === 1 : (x, y) => modules[y * size + x] === 1""")
    modified += """

/** Diagnostic only: call after actual decoding on an observer-owned grid. */
export function __qrStageRead(grid: Uint8Array, size: number, mirrored: boolean, ecc: ErrorCorrection, mask: number) {
  if (!Number.isInteger(size) || size < 21 || size > 177 || (size - 17) % 4 !== 0 || grid.length !== size * size) {
    throw new RangeError('Invalid diagnostic grid')
  }
  const copy = grid.slice()
  const read: ModuleReader = mirrored ? (x, y) => copy[x * size + y] === 1 : (x, y) => copy[y * size + x] === 1
  const result = readSymbol(read, size)
  const matchingHeader = result !== undefined && result.ecc === ecc && result.mask === mask
  const strictFormat = formatAgrees(read, size, ecc, mask)
  return { result, matchingHeader, strictFormat, accepted: matchingHeader && strictFormat, version: readVersion(read, size) }
}
"""
    original_symbol = (source / "symbol.ts").read_text()
    start_marker = "export function readSymbol(read: ModuleReader, size: number): Payload | undefined {"
    end_marker = "\nclass Bits {"
    if original_symbol.count(start_marker) != 1 or original_symbol.count(end_marker) != 1:
        raise ValueError("readSymbol boundaries must each occur exactly once")
    start = original_symbol.index(start_marker)
    end = original_symbol.index(end_marker, start)
    symbol_body = original_symbol[start:end]

    def symbol_replace(label, old, new):
        nonlocal symbol_body
        count = symbol_body.count(old)
        if count != 1:
            raise ValueError(f"{label}: expected exactly one readSymbol match, found {count}")
        symbol_body = symbol_body.replace(old, new, 1)
        replacements.append(label)

    symbol_replace("symbol trace callback", start_marker, start_marker + """
  // Set only by the runner for off-path stage reads, never during actual decode.
  const diagnostic = (globalThis as typeof globalThis & { __qrSymbolTrace?: (event: Record<string, unknown>) => void }).__qrSymbolTrace""")
    symbol_replace("symbol size failure",
                   "if (size < 21 || size > 177 || (size - 17) % 4 !== 0) return undefined",
                   "if (size < 21 || size > 177 || (size - 17) % 4 !== 0) { diagnostic?.({ reason: 'size', size }); return undefined }")
    symbol_replace("symbol version failure", "if (17 + 4 * version !== size) return undefined",
                   "if (17 + 4 * version !== size) { diagnostic?.({ reason: 'version', size, version }); return undefined }")
    symbol_replace("symbol format failure", "if (format === undefined) return undefined",
                   "if (format === undefined) { diagnostic?.({ reason: 'format', size, version }); return undefined }")
    symbol_replace("symbol correction failure", "if (fixed < 0 || fixed > limit) return undefined",
                   "if (fixed < 0 || fixed > limit) { diagnostic?.({ reason: fixed < 0 ? 'rs' : 'fixedlimit', size, version, blockIndex: b, fixed, limit }); return undefined }")
    symbol_replace("symbol zero failure", "if (data.every((word) => word === 0)) return undefined",
                   "if (data.every((word) => word === 0)) { diagnostic?.({ reason: 'zero', size, version }); return undefined }")
    symbol_replace("symbol parse failure", "if (parsed === undefined) return undefined",
                   "if (parsed === undefined) { diagnostic?.({ reason: 'parse', size, version }); return undefined }")
    modified_symbol = original_symbol[:start] + symbol_body + original_symbol[end:]
    hashes = {str(p.relative_to(source)): sha(p.read_bytes()) for p in sorted(source.rglob("*")) if p.is_file()}
    if hashes["refine.ts"] != sha(original.encode()) or hashes["symbol.ts"] != sha(original_symbol.encode()):
        raise ValueError("source changed while preparing instrumentation")
    revision = sys.argv[3] if len(sys.argv) == 4 else subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    identity = {"revision": revision, "sourceHashes": hashes, "originalRefineSha256": sha(original.encode()),
                "instrumentedRefineSha256": sha(modified.encode()), "instrumentedSymbolSha256": sha(modified_symbol.encode()),
                "instrumentSha256": sha(Path(__file__).read_bytes()),
                "replacements": replacements,
                "diagnostic": "Observer probes are additional, uncounted in production Work; never time this build. Stage helper runs off-path."}
    dest.mkdir(parents=True, exist_ok=False)
    shutil.copytree(source, dest / "src")
    for name, expected in hashes.items():
        if sha((dest / "src" / name).read_bytes()) != expected:
            raise ValueError(f"source changed while copying: {name}; discard the incomplete destination")
    (dest / "src" / "refine.ts").write_text(modified)
    (dest / "src" / "symbol.ts").write_text(modified_symbol)
    (dest / "identity.json").write_text(json.dumps(identity, indent=2) + "\n")
    print(json.dumps({"destination": str(dest), "identity": str(dest / "identity.json"),
                      "instrumentedRefineSha256": identity["instrumentedRefineSha256"]}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"instrumentation failed: {error}", file=sys.stderr)
        sys.exit(1)
