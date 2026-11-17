#!/usr/bin/env python3
"""Copy exact qualified TypeScript and add event-only timing classification hooks."""
import hashlib
import json
from pathlib import Path
import sys


def sha(data):
    return hashlib.sha256(data).hexdigest()


def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('Expected exactly one source anchor: ' + old[:100])
    return source.replace(old, new, 1)


if len(sys.argv) != 4:
    raise SystemExit('Usage: instrument-audit.py ROOT ARTIFACTS NEW_AUDIT_DIR')
root, base, out = (Path(v).resolve() for v in sys.argv[1:])
if out.exists():
    raise ValueError('Audit output must not exist')
qualified = json.loads((base / 'qualification.json').read_text())
assert qualified['passed']
expected = qualified['identity']['sources']
assert sorted(p.name for p in (root / 'src').glob('*.ts')) == sorted(expected)
sources = {}
for name, digest in expected.items():
    data = (root / 'src' / name).read_bytes()
    assert sha(data) == digest, name
    sources[name] = data.decode()
hook = ";(globalThis as typeof globalThis & { __qrTimingAudit?: (event: { kind: string }) => void }).__qrTimingAudit?.({ kind: '%s' })"
sources['decode.ts'] = once(sources['decode.ts'],
    '    if (!budget.quadraticMesh) budget.quadraticMesh = { candidate, inverseLuminance, mesh }',
    '    if (!budget.quadraticMesh) {\n      budget.quadraticMesh = { candidate, inverseLuminance, mesh }\n      ' + hook % 'retained' + '\n    }')
anchor = 'export function readQuadraticMesh(image: Luminance, candidate: Candidate, mesh: QuadraticMesh): { payload: Payload; mirrored: boolean } | undefined {\n'
sources['refine.ts'] = once(sources['refine.ts'], anchor, anchor + '  ' + hook % 'terminal' + '\n')
# This sequence is unique to the new terminal operation, not ordinary secondLook.
anchor = '  const levels = thresholds(image)\n  const probe = probeFor(image, levels, candidate.inverted)\n'
sources['refine.ts'] = once(sources['refine.ts'], anchor, '  ' + hook % 'sampling' + '\n' + anchor)
(out / 'src').mkdir(parents=True)
(out / 'package.json').write_text('{"type":"module"}\n')
for name, source in sources.items():
    (out / 'src' / name).write_text(source)
identity = {'sourceHashes': expected, 'observerSourceHashes': {n: sha(s.encode()) for n, s in sources.items()},
            'qualificationSha256': sha((base / 'qualification.json').read_bytes()),
            'instrumentSha256': sha(Path(__file__).read_bytes())}
(out / 'source-identity.json').write_text(json.dumps(identity, indent=2) + '\n')
print(out)
