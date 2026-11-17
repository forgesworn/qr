// Copies a dist directory and runs the alignment search only when a corner map's
// format copies agree within `limit` bits of one format word. Diagnostic only.
// node probe.mjs <from> <to> <limit>
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
const [from, to, limit] = process.argv.slice(2)
cpSync(from, to, { recursive: true })
const file = `${to}/locate.js`
let src = readFileSync(file, 'utf8')
const swap = (a, b) => {
  const n = src.split(a).length - 1
  if (n !== 1) throw Error(`pattern found ${n} times: ${a.slice(0, 60)}`)
  src = src.replace(a, b)
}
swap('if (size > 21 && !cornersOnly) {', `if (size > 21 && !cornersOnly && __probeOk(image, topLeft, topRight, bottomLeft, corners, size)) {`)
src += `
import { EC_ORDER, FORMAT_COORDS, formatBits } from './encode.js';
const __FORMATS = EC_ORDER.flatMap(ecc => [0, 1, 2, 3, 4, 5, 6, 7].map(mask => formatBits(ecc, mask)));
const __pop = n => { let c = 0; for (; n !== 0; n &= n - 1) c++; return c; };
function __probeOk(image, topLeft, topRight, bottomLeft, corners, size) {
  const far = size - 3.5;
  for (const corner of corners) {
    const m = quadMatrix([{ x: 3.5, y: 3.5 }, { x: far, y: 3.5 }, { x: far, y: far }, { x: 3.5, y: far }], [topLeft, topRight, corner, bottomLeft]);
    const read = (x, y) => {
      const u = x + 0.5, v = y + 0.5, w = m[6] * u + m[7] * v + m[8];
      const px = Math.floor((m[0] * u + m[1] * v + m[2]) / w), py = Math.floor((m[3] * u + m[4] * v + m[5]) / w);
      return px >= 0 && py >= 0 && px < image.width && py < image.height && image.data[py * image.width + px] === 1;
    };
    for (const mirrored of [false, true]) {
      const at = mirrored ? (x, y) => read(y, x) : read;
      let first = 0, second = 0;
      for (let i = 14; i >= 0; i--) {
        const [x, y] = FORMAT_COORDS[i];
        first = (first << 1) | (at(x, y) ? 1 : 0);
        second = (second << 1) | (at(i < 8 ? size - 1 - i : 8, i < 8 ? 8 : size - 7 + (i - 8)) ? 1 : 0);
      }
      for (const bits of __FORMATS) if (__pop(bits ^ first) <= ${Number(limit)} && __pop(bits ^ second) <= ${Number(limit)}) return true;
    }
  }
  return false;
}
`
writeFileSync(file, src)
console.log('probe', to, limit)
