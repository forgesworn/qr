// Copies a dist directory and applies one exact text substitution to decode.js. Diagnostic only.
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
const [from, to, search, replace] = process.argv.slice(2)
cpSync(from, to, { recursive: true })
const file = `${to}/decode.js`, src = readFileSync(file, 'utf8')
const n = src.split(search).length - 1
if (n !== 1) throw Error(`pattern found ${n} times`)
writeFileSync(file, src.replace(search, replace))
console.log('variant', to)
