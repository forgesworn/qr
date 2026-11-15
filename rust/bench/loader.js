// Loads the WebAssembly build of the decoder. No dependencies.
//
//   const { front, decode } = await loadFront('target/wasm32-unknown-unknown/release/forgesworn_qr.wasm')
//   front(pixels, width, height, channels)  // the number of finder candidates
//   decode(pixels, width, height, channels) // 0 if nothing reads, else payload bytes + 1
//
// `pixels` is a Uint8Array of width * height * channels bytes, channels 1
// (grey) or 4 (RGBA). It is copied into WebAssembly memory for each call.

import { readFile } from 'node:fs/promises'

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
  return { front: call('front'), decode: call('decode') }
}
