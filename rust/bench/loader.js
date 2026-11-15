// Loads the WebAssembly build of the decoder and encoder. No dependencies.
//
//   const { front, decode, encode } = await loadFront('target/wasm32-unknown-unknown/release/forgesworn_qr.wasm')
//   front(pixels, width, height, channels)  // the number of finder candidates
//   decode(pixels, width, height, channels) // 0 if nothing reads, else payload bytes + 1
//   encode(text, options)                   // { version, mask, size, modules }
//
// `pixels` is a Uint8Array of width * height * channels bytes, channels 1
// (grey) or 4 (RGBA). It is copied into WebAssembly memory for each call.
//
// `encode` takes a string, or a Uint8Array for one byte segment, and the
// options of the TypeScript `encode`: `ecc` ('L', 'M', 'Q', 'H'; default
// 'M'), `version`, `minVersion`, `mask`, `mode` ('numeric', 'alphanumeric',
// 'byte') and `eci`. `modules` is a Uint8Array of size * size, 1 for dark,
// copied out of WebAssembly memory. It throws a RangeError for bad options
// and for data that does not fit, with the code of the Rust `encode_error`
// in `error.code` (1 does not fit, 2 version, 3 minVersion, 4 mask, 5 version
// below minVersion, 6 mode for bytes, 7 text outside the mode, 8 level, 9 mode).
// A string is encoded as UTF-8 by TextEncoder, so a lone surrogate becomes
// U+FFFD, as in the TypeScript.

import { readFile } from 'node:fs/promises'

const LEVELS = { L: 0, M: 1, Q: 2, H: 3 }
const MODES = { numeric: 1, alphanumeric: 2, byte: 3 }
const NONE = 0xffffffff

export async function loadFront(path) {
  const { instance } = await WebAssembly.instantiate(await readFile(path), {})
  const { memory, alloc, free } = instance.exports
  const call = (name) => (pixels, width, height, channels) => {
    const length = width * height * channels
    if (pixels.length < length) throw new RangeError('The pixels are too short for the picture')
    const ptr = alloc(length)
    try {
      // Read the buffer after alloc(): it may have grown the memory.
      new Uint8Array(memory.buffer, ptr, length).set(pixels.subarray(0, length))
      return instance.exports[name](ptr, width, height, channels)
    } finally {
      free(ptr, length)
    }
  }

  // A number the Rust side takes as u32, or the code of an unusable one (checked there as out of range).
  const whole = (value, fallback, name) => {
    if (value === undefined || value === null) return fallback
    if (!Number.isInteger(value) || value < 0 || value > 0xfffffffe) throw new RangeError(`${name} must be a whole number`)
    return value
  }

  const encode = (data, options = {}) => {
    const o = options ?? {}
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    if (!(bytes instanceof Uint8Array)) throw new TypeError('encode takes a string or a Uint8Array')
    if (typeof data !== 'string' && o.mode !== undefined && o.mode !== 'byte') {
      throw Object.assign(new RangeError('Bytes can only be encoded in byte mode'), { code: 6 })
    }
    const ecc = o.ecc === undefined ? 1 : LEVELS[o.ecc] ?? 99
    const mode = o.mode === undefined ? 0 : MODES[o.mode] ?? 99
    const version = whole(o.version, 0, 'version')
    const minVersion = whole(o.minVersion, 0, 'minVersion')
    const mask = whole(o.mask, NONE, 'mask')
    const eci = o.eci === true ? 1 : 0
    const ptr = alloc(bytes.length)
    let handle
    try {
      new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes)
      const { encode_text, encode_bytes } = instance.exports
      handle =
        typeof data === 'string'
          ? encode_text(ptr, bytes.length, ecc, version, minVersion, mask, mode, eci)
          : encode_bytes(ptr, bytes.length, ecc, version, minVersion, mask, eci)
    } finally {
      free(ptr, bytes.length)
    }
    if (handle === 0) {
      const code = instance.exports.encode_error()
      throw Object.assign(new RangeError(`encode failed (code ${code})`), { code })
    }
    try {
      const size = instance.exports.qr_size(handle)
      const at = instance.exports.qr_modules(handle)
      return {
        version: instance.exports.qr_version(handle),
        mask: instance.exports.qr_mask(handle),
        size,
        modules: new Uint8Array(memory.buffer, at, size * size).slice(),
      }
    } finally {
      instance.exports.qr_free(handle)
    }
  }

  return { front: call('front'), decode: call('decode'), encode }
}
