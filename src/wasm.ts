import { QrCapacityError } from './errors.js'
import { imageLayout, type ImageLike, type DecodeOptions } from './image.js'
import type { DecodeResult } from './decode.js'
import type { EncodeOptions, QrCode, ErrorCorrection, Mode } from './encode.js'
import type { Payload } from './symbol.js'

/** The bundled module, relative to this entry. Fetch in browsers; read as a file URL in Node. */
export const wasmUrl: string = new URL('./qr.wasm', import.meta.url).href

export interface WasmQr {
  encode(data: string | Uint8Array, options?: EncodeOptions | null): QrCode
  /** Rust text support applies: see the README for kanji, hanzi and ECI limitations. */
  decode(image: ImageLike, options?: DecodeOptions): DecodeResult | undefined
  decodeModules(modules: ArrayLike<number | boolean>, size: number): (Payload & { mirrored: boolean }) | undefined
  /** Frees reusable input storage. The module remains usable. */
  reset(): void
  /** Frees input storage, releases module references and rejects subsequent operations. Idempotent. */
  dispose(): void
  /** Current WebAssembly linear memory size; zero after disposal. */
  readonly memoryBytes: number
}

const REQUIRED = [
  'qr_abi_version', 'alloc', 'free', 'read_picture', 'read_grid', 'read_error', 'read_free',
  'read_bytes_ptr', 'read_bytes_len', 'read_text_ptr', 'read_text_len', 'read_version', 'read_level',
  'read_mask', 'read_corrected', 'read_mirrored', 'read_inverted', 'read_eci_count', 'read_eci',
  'read_sa_present', 'read_sa_index', 'read_sa_total', 'read_sa_parity', 'read_fnc1', 'read_fnc1_ptr',
  'read_fnc1_len', 'read_has_alignment', 'read_point_x', 'read_point_y',
  'encode_text', 'encode_bytes', 'encode_error', 'qr_size', 'qr_version', 'qr_mask', 'qr_mode',
  'qr_level', 'qr_segments', 'qr_segment_mode', 'qr_segment_count', 'qr_modules', 'qr_free',
] as const
type Native = { memory: WebAssembly.Memory } & Record<typeof REQUIRED[number], (...args: number[]) => number>
const LEVELS: readonly ErrorCorrection[] = ['L', 'M', 'Q', 'H']
const MODES: readonly Mode[] = ['numeric', 'alphanumeric', 'byte']
const INVERSIONS = { both: 0, normal: 1, inverted: 2 }
const kind = (value: unknown) => Object.prototype.toString.call(value).slice(8, -1)

/**
 * Instantiates the bundled ABI from bytes supplied by the caller. Performs no
 * network or filesystem access. Instances and their reusable input buffers are
 * independent; returned bytes/modules are copies that survive reset/disposal.
 */
export async function loadWasm(bytes: Uint8Array | ArrayBuffer): Promise<WasmQr> {
  if (kind(bytes) !== 'Uint8Array' && kind(bytes) !== 'ArrayBuffer') throw new TypeError('loadWasm needs module bytes')
  const binary = new Uint8Array(bytes)
  const { instance } = await WebAssembly.instantiate(binary, {})
  if (!(instance.exports.memory instanceof WebAssembly.Memory) || REQUIRED.some(name => typeof instance.exports[name] !== 'function')) {
    throw new TypeError('The module does not implement the QR WebAssembly ABI')
  }
  let native: Native | undefined = instance.exports as Native
  if (native.qr_abi_version() !== 1) throw new RangeError('Unsupported QR WebAssembly ABI version')
  let pointer = 0
  let capacity = 0
  const encoder = new TextEncoder()
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true })
  const live = (): Native => {
    if (!native) throw new Error('The QR WebAssembly instance has been disposed')
    return native
  }
  const reset = () => {
    if (capacity) live().free(pointer, capacity)
    pointer = capacity = 0
  }
  const reserve = (length: number): Uint8Array => {
    const x = live()
    if (!Number.isSafeInteger(length) || length < 0 || length > 0xffffffff) throw new RangeError('Input exceeds WebAssembly address space')
    // Keep a non-null allocation even for an empty input.
    const needed = Math.max(1, length)
    if (needed > capacity) {
      reset()
      pointer = x.alloc(needed) >>> 0
      capacity = needed
    }
    // Allocation and decoding can grow memory; never cache a view across calls.
    return new Uint8Array(x.memory.buffer, pointer, length)
  }
  const text = (x: Native, ptr: number, length: number): string => decoder.decode(new Uint8Array(x.memory.buffer, ptr >>> 0, length))
  const take = (x: Native, h: number): Payload & { mirrored: boolean } => {
    const result: Payload & { mirrored: boolean } = {
      text: text(x, x.read_text_ptr(h), x.read_text_len(h)),
      bytes: new Uint8Array(x.memory.buffer, x.read_bytes_ptr(h) >>> 0, x.read_bytes_len(h)).slice(),
      version: x.read_version(h), ecc: LEVELS[x.read_level(h)]!, mask: x.read_mask(h),
      eci: Array.from({ length: x.read_eci_count(h) }, (_, i) => x.read_eci(h, i)),
      corrected: x.read_corrected(h), mirrored: x.read_mirrored(h) === 1,
      ...(x.read_sa_present(h) ? { structuredAppend: { index: x.read_sa_index(h), total: x.read_sa_total(h), parity: x.read_sa_parity(h) } } : {}),
    }
    const fnc1 = x.read_fnc1(h)
    if (fnc1 === 1) return { ...result, fnc1: { position: 'first' } }
    if (fnc1 === 2) return { ...result, fnc1: { position: 'second', applicationIndicator: text(x, x.read_fnc1_ptr(h), x.read_fnc1_len(h)) } }
    return result
  }
  const unread = (x: Native): undefined => {
    const code = x.read_error()
    if (code !== 1) throw Object.assign(new RangeError(`WebAssembly decode failed (code ${code})`), { code })
    return undefined
  }
  const whole = (value: number | undefined, fallback: number, low: number, high: number, name: string): number => {
    if (value === undefined) return fallback
    if (!Number.isInteger(value) || value < low || value > high) throw new RangeError(`Invalid ${name}`)
    return value
  }
  return {
    encode(data, options = {}) {
      const x = live()
      if (typeof data !== 'string' && kind(data) !== 'Uint8Array') throw new TypeError('encode takes a string or a Uint8Array')
      const o = options ?? {}
      const ecc = LEVELS.indexOf(o.ecc ?? 'M')
      if (ecc < 0) throw new RangeError('Unknown error correction level')
      const mask = whole(o.mask, 0xffffffff, 0, 7, 'mask')
      const version = whole(o.version, 0, 1, 40, 'version')
      const minVersion = whole(o.minVersion ?? 1, 1, 1, 40, 'minVersion')
      if (version !== 0 && version < minVersion) throw new RangeError('Version is below minVersion')
      const mode = o.mode === undefined ? 0 : MODES.indexOf(o.mode) + 1
      if (o.mode !== undefined && mode === 0) throw new RangeError('Unknown mode')
      if (typeof data !== 'string' && mode !== 0 && mode !== 3) throw new RangeError('Bytes can only be encoded in byte mode')
      if (data.length > (typeof data === 'string' ? 7089 : 2953)) throw new QrCapacityError('Data does not fit any QR symbol')
      const input = typeof data === 'string' ? encoder.encode(data) : data
      reserve(input.length).set(input)
      const h = typeof data === 'string'
        ? x.encode_text(pointer, input.length, ecc, version, minVersion, mask, mode, o.eci === true ? 1 : 0)
        : x.encode_bytes(pointer, input.length, ecc, version, minVersion, mask, o.eci === true ? 1 : 0)
      if (h === 0) {
        const code = x.encode_error()
        if (code === 1) throw new QrCapacityError('Data does not fit the requested QR symbol')
        throw Object.assign(new RangeError(`WebAssembly encode failed (code ${code})`), { code })
      }
      try {
        const size = x.qr_size(h)
        return {
          version: x.qr_version(h), ecc: LEVELS[x.qr_level(h)]!, mask: x.qr_mask(h), mode: MODES[x.qr_mode(h) - 1]!, size,
          segments: Array.from({ length: x.qr_segments(h) }, (_, i) => ({ mode: MODES[x.qr_segment_mode(h, i) - 1]!, count: x.qr_segment_count(h, i) })),
          modules: new Uint8Array(x.memory.buffer, x.qr_modules(h) >>> 0, size * size).slice(),
        }
      } finally { x.qr_free(h) }
    },
    decode(image, options = {}) {
      const x = live()
      const { width, height, stride, channels, inversion } = imageLayout(image, options)
      if (width > 0xffffffff || height > 0xffffffff || stride > 0xffffffff) throw new RangeError('Dimensions exceed WebAssembly address space')
      const length = (stride * (height - 1) + width) * channels
      reserve(length).set(image.data.subarray(0, length))
      const h = x.read_picture(pointer, length, width, height, channels, stride, INVERSIONS[inversion])
      if (h === 0) return unread(x)
      try {
        const point = (i: number) => ({ x: x.read_point_x(h, i), y: x.read_point_y(h, i) })
        return { ...take(x, h), inverted: x.read_inverted(h) === 1, location: {
          topLeft: point(0), topRight: point(1), bottomLeft: point(2), alignment: x.read_has_alignment(h) ? point(3) : undefined,
        } }
      } finally { x.read_free(h) }
    },
    decodeModules(modules, size) {
      const x = live()
      if (modules.length < size * size) throw new RangeError('Fewer modules than size x size')
      if (!Number.isInteger(size) || size < 21 || size > 177 || (size - 17) % 4 !== 0) return undefined
      const input = reserve(size * size)
      for (let i = 0; i < input.length; i++) input[i] = modules[i] ? 1 : 0
      const h = x.read_grid(pointer, input.length, size)
      if (h === 0) return unread(x)
      try { return take(x, h) } finally { x.read_free(h) }
    },
    reset() { live(); reset() },
    dispose() { reset(); native = undefined },
    get memoryBytes() { return native?.memory.buffer.byteLength ?? 0 },
  }
}
