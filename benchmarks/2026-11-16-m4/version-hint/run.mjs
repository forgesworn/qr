import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { observer } from './observer.mjs'
const [repoArg, outputArg] = process.argv.slice(2)
assert(repoArg && outputArg && process.argv.length === 4, 'Usage: node run.mjs <repo-root> <generated-directory>')
const root = resolve(repoArg), output = resolve(outputArg), fixture = join(output, 'fixture')
const rivals = process.env.QR_RIVALS; assert(rivals, 'QR_RIVALS required')
const hash = x => createHash('sha256').update(x).digest('hex'), fileHash = p => hash(readFileSync(p))
const expected = { 'generate.mjs':'18f9a09f86df2c790f60143830bbff8587f5ac82c1c89ea734ef69aa306bde6d', 'manifest.json':'ccaa10cce97579506cbeca720fc2752009c5a13fef267a22e59a84d020c0fff9', 'photo.ts':'d34ab6f88bce5e26342c07a3868577fd73b080379c605e1fd2e8516f85db7bf4', 'photo.mjs':'06c665a630e8bb6b5bf0196d422154cf855c2fc3fd7299195ec1223865ffa1b4' }
for (const [name, digest] of Object.entries(expected)) assert.equal(fileHash(join(fixture, name)), digest, name)
const manifest = JSON.parse(readFileSync(join(fixture, 'manifest.json'))), external = createRequire(join(resolve(rivals), 'package.json'))
assert.equal(external('qrcode/package.json').version, '1.5.4'); assert.equal(fileHash(external.resolve('qrcode')), manifest.qrcodeMainSha256)
const load = p => import(pathToFileURL(join(output, p)).href)
const base = await load('base/decode.js'), inst = await load('instrumented/decode.js')
const { makeCase } = await load('fixture/generate.mjs'), { frame } = await load('fixture/photo.mjs')
const sh = createHash('sha256'); for (const name of readdirSync(join(output, 'snapshot/src')).filter(n => n.endsWith('.ts')).sort()) sh.update(name).update(readFileSync(join(output, 'snapshot/src', name)))
const rev = execFileSync('git', ['rev-parse','3c06d8047287994a6e071e87425de1b04cc66d10'], { cwd:root, encoding:'utf8' }).trim()
const tool = new URL('.', import.meta.url)
const sourceSha256 = sh.digest('hex')
const header = { revision:rev, sourceSha256, fixtureHashes:expected, qrcodeMainSha256:manifest.qrcodeMainSha256, rivalLockSha256:fileHash(join(resolve(rivals), 'package-lock.json')), builderSha256:fileHash(new URL('build.cjs',tool)), observerSha256:fileHash(new URL('observer.mjs',tool)), runnerSha256:fileHash(new URL('run.mjs',tool)), node:process.version, arch:process.arch }
console.log(JSON.stringify({ header }))
const work = () => ({steps:0,compared:0,scanned:0,maps:0,second:0,meshes:0,probed:0,reduced:0})
for (const [group, index] of [[2,25],[7,25]]) {
  const { meta, image } = makeCase(group, index), frozen = manifest.cases[group * 28 + index]
  assert.deepEqual(meta, frozen); assert.equal(hash(image.data), meta.greySha256); assert.equal(meta.version,40); assert.equal(meta.ecc,'M')
  const project = frame(meta.size, meta.shot), truth = [[3.5,3.5],[meta.size-3.5,3.5],[3.5,meta.size-3.5]].map(([x,y]) => project.at(x,y))
  const frameHash = hash(image.data), a = work(), b = work(), originalFinders = [], instrumentedFinders = []
  globalThis.__finderOutput = f => originalFinders.push(structuredClone(f))
  const baseline = base.decodeCounted(image, {}, a); assert.equal(hash(image.data),frameHash)
  globalThis.__finderOutput = f => instrumentedFinders.push(structuredClone(f)); globalThis.__v40 = observer(truth)
  const result = inst.decodeCounted(image, {}, b); assert.equal(hash(image.data),frameHash)
  assert.deepEqual(result,baseline); assert.deepEqual(b,a); assert.deepEqual(instrumentedFinders,originalFinders)
  const obs = globalThis.__v40.report()
  // Explicitly preserve otherwise lossy JSON representations of absent/nonfinite values.
  console.log(JSON.stringify({ meta, frameHash, result:result ?? null, work:b, obs }, (_, value) => value === undefined ? '<undefined>' : typeof value === 'number' && !Number.isFinite(value) ? String(value) : value))
}
