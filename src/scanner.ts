import { decodeCounted, type DecodeWorkspace } from './decode.js'
import { trackedDecoder, type Decoder } from './session.js'

export type { Decoder } from './session.js'

/** Reads fresh camera frames with independent working storage and a tracked region. */
export function createDecoder(): Decoder {
  const workspace: DecodeWorkspace = {}
  return trackedDecoder(
    (image, options) => decodeCounted(image, options, undefined, workspace),
    () => { workspace.luminance = undefined },
  )
}
