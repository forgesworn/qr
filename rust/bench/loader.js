// Loads the WebAssembly build of the front end. No dependencies.
//
//   const { front } = await loadFront('target/wasm32-unknown-unknown/release/forgesworn_qr.wasm')
//   front(pixels, width, height, channels) // the number of finder candidates
//
// `pixels` is a Uint8Array of width * height * channels bytes, channels 1
// (grey) or 4 (RGBA). It is copied into WebAssembly memory for the call.

import { readFile } from 'node:fs/promises'

export async function loadFront(path) {
  const { instance } = await WebAssembly.instantiate(await readFile(path), {})
  const { memory, alloc, free, front } = instance.exports
  return {
    front(pixels, width, height, channels) {
      const length = width * height * channels
      if (pixels.length < length) throw new RangeError('The pixels are too short for the picture')
      const ptr = alloc(length)
      try {
        // Read the buffer after alloc(): it may have grown the memory.
        new Uint8Array(memory.buffer, ptr, length).set(pixels.subarray(0, length))
        return front(ptr, width, height, channels)
      } finally {
        free(ptr, length)
      }
    },
  }
}
