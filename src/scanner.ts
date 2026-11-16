import { imageLayout } from './image.js'
import { decodeCounted, type DecodeOptions, type DecodeResult, type DecodeWorkspace, type ImageLike } from './decode.js'

/** A reusable, synchronous decoder for consecutive frames from one camera. */
export interface Decoder {
  /** Reads fresh pixels each time, trying the previous region before the full frame. */
  decode(image: ImageLike, options?: DecodeOptions): DecodeResult | undefined
  /** Forgets the previous region and releases references to working storage. */
  reset(): void
}

interface Region { x: number; y: number; width: number; height: number }

function regionFor(result: DecodeResult, width: number, height: number): Region | undefined {
  const { topLeft: a, topRight: b, bottomLeft: c, alignment } = result.location
  const span = Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y))
  const module = span / (10 + 4 * result.version)
  const margin = Math.max(12, span / 4, 8 * module)
  const points = [a, b, c, { x: b.x + c.x - a.x, y: b.y + c.y - a.y }]
  if (alignment) points.push(alignment)
  // Keep the block grid aligned with the full image where possible.
  const x = Math.max(0, Math.floor((Math.min(...points.map(p => p.x)) - margin) / 8) * 8)
  const y = Math.max(0, Math.floor((Math.min(...points.map(p => p.y)) - margin) / 8) * 8)
  const right = Math.min(width, Math.ceil((Math.max(...points.map(p => p.x)) + margin) / 8) * 8)
  const bottom = Math.min(height, Math.ceil((Math.max(...points.map(p => p.y)) + margin) / 8) * 8)
  const region = { x, y, width: right - x, height: bottom - y }
  // A miss falls back to the full frame. Bound the extra pixels to half a frame.
  return region.width >= 21 && region.height >= 21 && region.width * region.height <= width * height / 2 ? region : undefined
}

/**
 * Creates an independent camera decoder. It retains its own luminance storage
 * and a search rectangle, never the caller's pixels or a previous payload.
 * On a region miss it searches the whole frame during the same call.
 */
export function createDecoder(): Decoder {
  const workspace: DecodeWorkspace = {}
  let region: Region | undefined
  let previousWidth = 0
  let previousHeight = 0
  return {
    decode(image, options = {}) {
      const { width, height, stride, channels } = imageLayout(image, options)
      if (width !== previousWidth || height !== previousHeight) region = undefined
      previousWidth = width
      previousHeight = height
      let found: DecodeResult | undefined
      if (region) {
        const { x, y } = region
        const crop = { data: image.data.subarray((y * stride + x) * channels), width: region.width, height: region.height }
        const local = decodeCounted(crop, { ...options, channels, rowStride: stride }, undefined, workspace)
        if (local) {
          const move = (p: { x: number; y: number }) => ({ x: p.x + x, y: p.y + y })
          found = { ...local, location: {
            topLeft: move(local.location.topLeft), topRight: move(local.location.topRight),
            bottomLeft: move(local.location.bottomLeft),
            alignment: local.location.alignment ? move(local.location.alignment) : undefined,
          } }
        }
      }
      found ??= decodeCounted(image, options, undefined, workspace)
      region = found ? regionFor(found, width, height) : undefined
      return found
    },
    reset() {
      region = undefined
      workspace.luminance = undefined
      previousWidth = previousHeight = 0
    },
  }
}
