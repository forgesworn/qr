// Expose the existing private reader in a scratch-only generated module.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process')
const [rootArg, generatedArg] = process.argv.slice(2)
if (!rootArg || !generatedArg || process.argv.length !== 4) throw Error('Usage: node counterfactual-build.cjs <repo-root> <generated-dir>')
const root = path.resolve(rootArg), generated = path.resolve(generatedArg), rev = '3c06d8047287994a6e071e87425de1b04cc66d10'
const ts = require(path.join(root, 'node_modules/typescript'))
const original = execFileSync('git', ['show', `${rev}:src/decode.ts`], { cwd: root, encoding: 'utf8' })
if (original !== fs.readFileSync(path.join(generated, 'snapshot/src/decode.ts'), 'utf8')) throw Error('generated snapshot differs from pinned source')
const source = original + '\nexport { read as counterfactualRead }\n'
fs.writeFileSync(path.join(generated, 'base/counterfactual-decode.js'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText, { flag: 'wx' })
