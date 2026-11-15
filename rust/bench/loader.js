// Loads the WebAssembly build of the decoder and encoder. No dependencies.
//
//   const { front, decode, encode } = await loadFront('target/wasm32-unknown-unknown/release/forgesworn_qr.wasm')
//   front(pixels, width, height, channels)  // the number of finder candidates
//   decode(pixels, width, height, channels) // 0 if nothing reads, else payload bytes + 1
//   encode(text, options)                   // { version, mask, size, modules }
//   decodeFull(pixels, width, height, options) // the TypeScript DecodeResult, or undefined
//   decodeGrid(modules, size)               // as decodeModules: the result without a location
//   lastWork()                              // the eight work counters of the last decodeFull
//   memory                                  // the module's WebAssembly.Memory
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
//
// `decodeFull` takes the pixels of the TypeScript `decode` and its options
// `{ channels, rowStride, inversion }` (defaults as there: the channels are
// worked out from the data length, the stride is the width, the inversion is
// 'both'). It returns the fields of the TypeScript `DecodeResult` (`text`,
// `bytes`, `version`, `ecc`, `mask`, `eci`, `corrected`, `mirrored`,
// `inverted`, `location`, and `structuredAppend` and `fnc1` only when present),
// with `bytes` a copy, or undefined when nothing reads. Where the TypeScript
// throws, it throws a RangeError (a TypeError for pixels that are not a
// Uint8Array or Uint8ClampedArray) with the Rust `read_error` in `error.code`
// (2 channels, 3 width or height, 4 rowStride, 5 too few bytes, 6 inversion).
// Only the bytes the picture needs are copied into WebAssembly memory, and the
// result handle and the copy are freed before it returns. `lastWork()` gives
// `{ steps, compared, scanned, maps, second, meshes, probed, reduced }` for the
// latest decodeFull, also when it read nothing; each is a Number, or a BigInt
// where it is 2^53 or more, so that it is always exact.

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

  const WORK = ['steps', 'compared', 'scanned', 'maps', 'second', 'meshes', 'probed', 'reduced']
  const lastWork = () => {
    const out = {}
    WORK.forEach((name, i) => {
      const high = instance.exports.work_high(i)
      const low = instance.exports.work_low(i)
      out[name] = high < 0x200000 ? high * 0x100000000 + low : (BigInt(high) << 32n) | BigInt(low)
    })
    return out
  }

  const LETTERS = ['L', 'M', 'Q', 'H']
  // ignoreBOM keeps a leading U+FEFF in the text; fatal makes ill-formed UTF-8 from the module an error, not U+FFFD.
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })

  // Everything a handle holds, copied out of WebAssembly memory. The caller frees the handle.
  const take = (h, grid) => {
    const x = instance.exports
    const bytesAt = x.read_bytes_ptr(h)
    const bytesLen = x.read_bytes_len(h)
    const textAt = x.read_text_ptr(h)
    const textLen = x.read_text_len(h)
    const result = {
      text: textLen === 0 ? '' : decoder.decode(new Uint8Array(memory.buffer, textAt, textLen)),
      bytes: bytesLen === 0 ? new Uint8Array(0) : new Uint8Array(memory.buffer, bytesAt, bytesLen).slice(),
      version: x.read_version(h),
      ecc: LETTERS[x.read_level(h)],
      mask: x.read_mask(h),
      eci: Array.from({ length: x.read_eci_count(h) }, (_, i) => x.read_eci(h, i)),
      corrected: x.read_corrected(h),
    }
    if (x.read_sa_present(h)) {
      result.structuredAppend = { index: x.read_sa_index(h), total: x.read_sa_total(h), parity: x.read_sa_parity(h) }
    }
    const fnc1 = x.read_fnc1(h)
    if (fnc1 === 1) result.fnc1 = { position: 'first' }
    else if (fnc1 === 2) {
      const at = x.read_fnc1_ptr(h)
      const len = x.read_fnc1_len(h)
      result.fnc1 = { position: 'second', applicationIndicator: decoder.decode(new Uint8Array(memory.buffer, at, len)) }
    }
    result.mirrored = x.read_mirrored(h) === 1
    if (!grid) {
      const point = (which) => ({ x: x.read_point_x(h, which), y: x.read_point_y(h, which) })
      result.inverted = x.read_inverted(h) === 1
      result.location = {
        topLeft: point(0),
        topRight: point(1),
        bottomLeft: point(2),
        alignment: x.read_has_alignment(h) ? point(3) : undefined,
      }
    }
    return result
  }

  const INVERSIONS = { both: 0, normal: 1, inverted: 2 }
  const MESSAGES = {
    2: 'channels must be 1 or 4',
    3: 'Width and height must be positive integers',
    4: 'rowStride must be an integer of at least width',
    5: 'The data is too short for the picture',
    6: "inversion must be 'normal', 'inverted' or 'both'",
  }
  const complain = (code) => Object.assign(new RangeError(MESSAGES[code] ?? `decode failed (code ${code})`), { code })

  const decodeFull = (pixels, width, height, options = {}) => {
    const o = options ?? {}
    const kind = Object.prototype.toString.call(pixels).slice(8, -1)
    if (kind !== 'Uint8Array' && kind !== 'Uint8ClampedArray') throw new TypeError(`data must be a Uint8Array or Uint8ClampedArray, not ${kind}`)
    const inversion = o.inversion === undefined ? 0 : INVERSIONS[o.inversion] ?? 99
    if (inversion === 99) throw complain(6)
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 0xffffffff || height > 0xffffffff) throw complain(3)
    const stride = o.rowStride ?? width
    if (!Number.isInteger(stride) || stride < width || stride > 0xffffffff) throw complain(4)
    const last = stride * (height - 1) + width
    let channels = o.channels
    if (channels !== undefined && channels !== 1 && channels !== 4) throw complain(2)
    // As the TypeScript: three bytes a pixel would be read as greyscale and find nothing.
    if (channels === undefined && pixels.length >= last * 3 && pixels.length < last * 4) {
      throw Object.assign(new RangeError('The data looks like three bytes a pixel: pass RGBA or greyscale, or name channels'), { code: 2 })
    }
    channels ??= pixels.length >= last * 4 ? 4 : 1
    const length = last * channels
    if (pixels.length < length) throw complain(5)
    const ptr = alloc(length)
    let handle
    try {
      // Read the buffer after alloc(): it may have grown the memory.
      new Uint8Array(memory.buffer, ptr, length).set(pixels.subarray(0, length))
      handle = instance.exports.read_picture(ptr, length, width, height, channels, stride, inversion)
    } finally {
      free(ptr, length)
    }
    if (handle === 0) {
      const code = instance.exports.read_error()
      if (code === 1) return undefined
      throw complain(code)
    }
    try {
      return take(handle, false)
    } finally {
      instance.exports.read_free(handle)
    }
  }

  // As decodeModules of the TypeScript: `modules` holds size * size numbers, nonzero for dark.
  // The result has no `inverted` or `location`, as there.
  const decodeGrid = (modules, size) => {
    if (!Number.isInteger(size) || size < 0 || size > 0xffff || modules.length < size * size) throw complain(5)
    const bytes = Uint8Array.from({ length: size * size }, (_, i) => (modules[i] ? 1 : 0))
    const ptr = alloc(bytes.length)
    let handle
    try {
      new Uint8Array(memory.buffer, ptr, bytes.length).set(bytes)
      handle = instance.exports.read_grid(ptr, bytes.length, size)
    } finally {
      free(ptr, bytes.length)
    }
    if (handle === 0) {
      const code = instance.exports.read_error()
      if (code === 1) return undefined
      throw complain(code)
    }
    try {
      return take(handle, true)
    } finally {
      instance.exports.read_free(handle)
    }
  }

  return { front: call('front'), decode: call('decode'), encode, decodeFull, decodeGrid, lastWork, memory }
}
