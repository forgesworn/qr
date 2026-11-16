// Before publication: --stage PATH. After publication: --published checks native
// JSR imports; --compat-archive PATH checks its actual npm compatibility tarball.
// A locally built npm tarball is not a substitute for JSR's generated package.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { packageName, sha256, verifyStage } from './prepare-jsr.mjs'

const { values } = parseArgs({ options: {
  stage: { type: 'string' }, deno: { type: 'string' }, 'compat-archive': { type: 'string' },
  published: { type: 'boolean', default: false },
} })
assert(values.stage, 'Supply --stage with the output of prepare-jsr.mjs')
const stage = resolve(values.stage), receipt = verifyStage(stage)
const deno = values.deno ?? 'deno'
const denoVersion = spawnSync(deno, ['--version'], { encoding: 'utf8', timeout: 15_000 })
const hasDeno = denoVersion.status === 0
assert(hasDeno, `Deno is required for the publication and consumer checks: ${deno}`)
if (values.published) assert(hasDeno, '--published requires Deno for native jsr: imports')
const run = (command, args, cwd, timeout = 120_000) => execFileSync(command, args, { cwd, stdio: 'inherit', timeout })
// Never use --allow-slow-types: generated declarations are part of this gate.
run(deno, ['publish', '--dry-run', '--sloppy-imports'], stage)

function consumer(main, adapter) {
  return `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as ts from ${JSON.stringify(main)};
import { loadWasm, wasmUrl } from ${JSON.stringify(adapter)};
const assetUrl = new URL(wasmUrl);
assert(['file:', 'https:'].includes(assetUrl.protocol), 'Unexpected WASM URL protocol');
let bytes;
if (assetUrl.protocol === 'https:') {
  const response = await fetch(assetUrl, { signal: AbortSignal.timeout(60_000) });
  assert(response.ok, 'Published WASM asset HTTP ' + response.status);
  bytes = new Uint8Array(await response.arrayBuffer());
} else bytes = new Uint8Array(readFileSync(assetUrl));
assert.equal(createHash('sha256').update(bytes).digest('hex'), ${JSON.stringify(receipt.wasmSha256)});
const wasm = await loadWasm(bytes);
try {
  for (const input of ['https://example.com/jsr', 'QR JSR ✓', new Uint8Array([0, 127, 255])]) {
    const qr = ts.encode(input);
    assert.deepEqual(wasm.encode(input), qr);
    const expected = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    const decoded = wasm.decodeModules(qr.modules, qr.size);
    assert(decoded, 'WASM failed to decode the encoded payload');
    assert.deepEqual(decoded.bytes, expected);
    if (typeof input === 'string') assert.equal(decoded.text, input);
    assert.deepEqual(decoded, ts.decodeModules(qr.modules, qr.size));
    if (typeof input === 'string') {
      const width = (qr.size + 8) * 4, data = new Uint8Array(width * width).fill(255);
      for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y * qr.size + x]) {
        for (let dy = 0; dy < 4; dy++) data.fill(0, ((y + 4) * 4 + dy) * width + (x + 4) * 4, ((y + 4) * 4 + dy) * width + (x + 5) * 4);
      }
      const image = { data, width, height: width };
      const found = wasm.decode(image);
      assert(found, 'WASM failed to decode a rendered image');
      assert.equal(found.text, input); assert.deepEqual(found.bytes, expected);
      // Locator objects may carry private finder statistics in TypeScript.
      // Compare the published Point contract, which contains only x and y.
      const publicResult = r => r && ({ ...r, location: Object.fromEntries(
        Object.entries(r.location).map(([key, point]) => [key, point && { x: point.x, y: point.y }])) });
      assert.deepEqual(publicResult(found), publicResult(ts.decode(image)));
      const session = wasm.createDecoder();
      assert.deepEqual(session.decode(image), found);
      wasm.reset(); assert.deepEqual(session.decode(image), found);
      session.reset();
    }
  }
  assert.throws(() => wasm.encode(new Uint8Array(3000)), ts.QrCapacityError);
  const session = wasm.createDecoder();
  ts.createDecoder().reset(); wasm.dispose();
  assert.throws(() => session.reset(), /disposed/);
  assert.throws(() => wasm.encode('disposed'), /disposed/);
} finally { wasm.dispose(); }
console.log('JSR consumer: entry points, payloads, images, asset hash and lifecycle passed');
`
}

const scratch = mkdtempSync(join(tmpdir(), 'qr-jsr-consumer-'))
let sourceConsumer = false, publishedConsumer = false, compatibilityConsumer = false
try {
  if (hasDeno) {
    writeFileSync(join(scratch, 'source.mjs'), consumer(pathToFileURL(join(stage, 'src/index.ts')).href, pathToFileURL(join(stage, 'src/wasm.ts')).href))
    // These are unchanged NodeNext sources. Publishing resolves their .js imports;
    // the local pre-publication consumer needs Deno's corresponding resolution.
    run(deno, ['run', '--no-config', '--no-lock', '--unstable-sloppy-imports', '--check', '--allow-read', join(scratch, 'source.mjs')], stage)
    sourceConsumer = true
  }
  if (values.published) {
    const main = `jsr:${packageName}@${receipt.version}`
    writeFileSync(join(scratch, 'published.mjs'), consumer(main, main + '/wasm'))
    // This checks our exact, just-published dependency-free version after registry
    // hashes and provenance were checked. Do not apply a global age-policy change.
    run(deno, ['run', '--no-config', '--no-lock', '--min-dep-age=0', '--check', '--allow-read', '--allow-net=jsr.io', join(scratch, 'published.mjs')], scratch)
    publishedConsumer = true
  }
  if (values['compat-archive']) {
    const archive = resolve(values['compat-archive'])
    writeFileSync(join(scratch, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', archive], scratch)
    const installed = JSON.parse(readFileSync(join(scratch, 'node_modules/@jsr/forgesworn__qr/package.json'), 'utf8'))
    assert.equal(installed.name, '@jsr/forgesworn__qr', 'Supply the JSR compatibility archive, not the npmjs release')
    assert.equal(installed.version, receipt.version)
    assert.equal(Object.keys(installed.dependencies ?? {}).length, 0)
    writeFileSync(join(scratch, 'consumer.mjs'), consumer('@jsr/forgesworn__qr', '@jsr/forgesworn__qr/wasm'))
    run(process.execPath, [join(scratch, 'consumer.mjs')], scratch)
    writeFileSync(join(scratch, 'types.ts'), `import { encode, decode, type QrCode, type DecodeResult } from '@jsr/forgesworn__qr';
import { loadWasm, wasmUrl, type WasmQr } from '@jsr/forgesworn__qr/wasm';
const qr: QrCode = encode('types');
const decoded: DecodeResult | undefined = decode({data: new Uint8Array(441), width: 21, height: 21});
const api: Promise<WasmQr> = loadWasm(new Uint8Array());
const url: string = wasmUrl;
void [qr, decoded, api, url];\n`)
    const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
    run(process.execPath, [compiler, '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--lib', 'ES2022,DOM', 'types.ts'], scratch)
    compatibilityConsumer = true
  }
  assert(sourceConsumer || compatibilityConsumer, 'Dry-run passed, but no consumer ran: install Deno or supply --compat-archive')
  verifyStage(stage)
  console.log(JSON.stringify({ name: packageName, version: receipt.version, wasmSha256: receipt.wasmSha256,
    strictPublishDryRun: true, sourceConsumer, publishedConsumer, compatibilityConsumer,
    compatibilityArchiveSha256: values['compat-archive'] ? sha256(readFileSync(resolve(values['compat-archive']))) : null,
    compatibilityNote: compatibilityConsumer ? 'Registry-generated archive tested; this does not verify registry provenance.' : 'Requires the registry-generated npm archive after publication; not yet qualified.',
  }, null, 2))
} finally { rmSync(scratch, { recursive: true, force: true }) }
