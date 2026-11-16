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
  assert(packed[0].files.some(f => f.path === 'dist/qr.wasm'))
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
      wasm.dispose();
      assert.equal(found.text, 'https://example.com/package');
      createDecoder().reset();
    } finally { wasm.dispose(); }
    console.log('Packed main entry, WASM asset, full results and disposal passed');
  `)
  execFileSync(process.execPath, ['check.mjs'], { cwd: scratch, stdio: 'inherit' })
  assert(readFileSync(join(scratch, 'node_modules/@forgesworn/qr/dist/qr.wasm')).equals(readFileSync(new URL('../wasm/qr.wasm', import.meta.url))))
} finally { rmSync(scratch, { recursive: true, force: true }) }
