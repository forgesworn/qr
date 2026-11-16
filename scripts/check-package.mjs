// Exercise the published shape in an isolated consumer, without a Rust toolchain.
import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const scratch = mkdtempSync(join(tmpdir(), 'qr-package-'))
try {
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', scratch], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
  const archive = join(scratch, packed[0].filename)
  for (const path of ['dist/qr.wasm', 'dist/index.d.ts', 'dist/wasm.d.ts',
    'LICENSE', 'README.md', 'SPEC.md', 'llms.txt', 'llms-full.txt',
    'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'licenses/RUST-MIT.txt',
    'licenses/COMPILER-BUILTINS.txt', 'licenses/UNICODE-3.0.txt']) {
    assert(packed[0].files.some(f => f.path === path), `Missing package file: ${path}`)
  }
  writeFileSync(join(scratch, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', archive], { cwd: scratch, stdio: 'inherit' })
  writeFileSync(join(scratch, 'check.mjs'), `
    import { strict as assert } from 'node:assert';
    import { readFile } from 'node:fs/promises';
    import { encode, decodeModules, createDecoder, QrCapacityError } from '@forgesworn/qr';
    import { loadWasm, wasmUrl } from '@forgesworn/qr/wasm';
    const bytes = await readFile(new URL(wasmUrl));
    assert.equal(import.meta.resolve('@forgesworn/qr/qr.wasm'), wasmUrl);
    const wasm = await loadWasm(bytes);
    try {
      const qr = wasm.encode('https://example.com/package');
      assert.deepEqual(qr, encode('https://example.com/package'));
      const found = wasm.decodeModules(qr.modules, qr.size);
      assert.deepEqual(found, decodeModules(qr.modules, qr.size));
      assert.throws(() => wasm.encode(new Uint8Array(3000)), QrCapacityError);
      const session = wasm.createDecoder();
      session.reset();
      wasm.dispose();
      assert.throws(() => session.reset(), /disposed/);
      assert.equal(found.text, 'https://example.com/package');
      createDecoder().reset();
    } finally { wasm.dispose(); }
    console.log('Packed main entry, WASM asset, full results and disposal passed');
  `)
  execFileSync(process.execPath, ['check.mjs'], { cwd: scratch, stdio: 'inherit' })
  assert(readFileSync(join(scratch, 'node_modules/@forgesworn/qr/dist/qr.wasm')).equals(readFileSync(new URL('../wasm/qr.wasm', import.meta.url))))
} finally { rmSync(scratch, { recursive: true, force: true }) }
