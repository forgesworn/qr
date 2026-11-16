import { fromEci, hanziText, kanjiText, looksShiftJis } from './text.js'

/** ABI 2 text import. Called during segment parsing, before a symbol is accepted. */
export function textImports(memory: () => WebAssembly.Memory) {
  const encoder = new TextEncoder()
  return {
    qr_text: {
      decode(kind: number, value: number, pointer: number, length: number, output: number, capacity: number): number {
        // Rust may have grown memory while allocating the destination. Views never
        // survive this call and the callback never calls back into the module.
        const buffer = memory().buffer
        const bytes = new Uint8Array(buffer, pointer >>> 0, length >>> 0)
        const text = kind === 0 ? fromEci(value, bytes)
          : kind === 1 ? kanjiText(value)
          : kind === 2 ? hanziText(value >>> 8, value & 255)
          : kind === 3 && looksShiftJis(bytes) ? fromEci(20, bytes)
          : undefined
        if (text === undefined) return -1
        const encoded = encoder.encode(text)
        if (encoded.length > (capacity >>> 0)) return -1
        new Uint8Array(buffer, output >>> 0, capacity >>> 0).set(encoded)
        return encoded.length
      },
    },
  }
}
