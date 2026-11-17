// Copies a dist directory and applies exact text substitutions to one file. Diagnostic only.
// node patchfile.mjs <from> <to> <file> <search> <replace> [<file> <search> <replace>]...
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
const [from, to, ...edits] = process.argv.slice(2)
cpSync(from, to, { recursive: true })
for (let i = 0; i < edits.length; i += 3) {
  const file = `${to}/${edits[i]}`, search = edits[i + 1], replace = edits[i + 2]
  const src = readFileSync(file, 'utf8')
  const n = src.split(search).length - 1
  if (n !== 1) throw Error(`${edits[i]}: pattern found ${n} times`)
  writeFileSync(file, src.replace(search, replace))
}
console.log('patched', to)
