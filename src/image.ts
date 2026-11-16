/** Pixels to read: RGBA (4 bytes a pixel, as ImageData gives) or greyscale (1 byte a pixel). */
export interface ImageLike {
  readonly data: Uint8Array | Uint8ClampedArray
  readonly width: number
  readonly height: number
}

export interface DecodeOptions {
  /** Pixels from the start of one row to the next, for padded camera planes. Default: width. */
  readonly rowStride?: number
  /** Bytes a pixel. Default: worked out from the data length. */
  readonly channels?: 1 | 4
  /** Which way round to look for dark modules. Default 'both': dark on light first, then light on dark. */
  readonly inversion?: 'normal' | 'inverted' | 'both'
}

function channelsFor(image: ImageLike, stride: number, given: 1 | 4 | undefined): 1 | 4 {
  const { data, width, height } = image
  const last = stride * (height - 1) + width
  if (given !== undefined && given !== 1 && given !== 4) throw new RangeError('channels must be 1 or 4')
  // Three bytes a pixel would otherwise be read as greyscale and find nothing.
  if (given === undefined && data.length >= last * 3 && data.length < last * 4) {
    throw new RangeError('The data looks like three bytes a pixel: pass RGBA or greyscale, or name channels')
  }
  const channels = given ?? (data.length >= last * 4 ? 4 : 1)
  if (data.length < last * channels) throw new RangeError(`The data is too short for a ${width}x${height} picture`)
  return channels
}

/** Validates the complete input before a session considers a smaller region. */
export function imageLayout(image: ImageLike, options: DecodeOptions = {}) {
  if (image === null || typeof image !== 'object') throw new TypeError('decode needs { data, width, height }')
  const kind = Object.prototype.toString.call(image.data).slice(8, -1)
  if (kind !== 'Uint8Array' && kind !== 'Uint8ClampedArray') {
    throw new TypeError(`data must be a Uint8Array or Uint8ClampedArray, not ${kind}`)
  }
  options ??= {}
  const inversion = options.inversion ?? 'both'
  if (inversion !== 'both' && inversion !== 'normal' && inversion !== 'inverted') {
    throw new RangeError("inversion must be 'normal', 'inverted' or 'both'")
  }
  const { width, height } = image
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Width and height must be positive integers')
  }
  const stride = options.rowStride ?? width
  if (!Number.isInteger(stride) || stride < width) throw new RangeError('rowStride must be an integer of at least width')
  const channels = channelsFor(image, stride, options.channels)
  return { width, height, stride, channels, inversion }
}
