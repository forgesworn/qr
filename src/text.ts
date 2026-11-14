// UTF-8 decoding without TextDecoder, which ES2022 does not guarantee.

/** Length of the well-formed UTF-8 sequence at `i`, or 0 if it is not one. */
function sequence(bytes: Uint8Array, i: number): number {
  const b = bytes[i]!
  if (b < 0x80) return 1
  const length = b >= 0xc2 && b <= 0xdf ? 2 : b >= 0xe0 && b <= 0xef ? 3 : b >= 0xf0 && b <= 0xf4 ? 4 : 0
  if (length === 0 || i + length > bytes.length) return 0
  const second = bytes[i + 1]!
  const low = b === 0xe0 ? 0xa0 : b === 0xf0 ? 0x90 : 0x80
  const high = b === 0xed ? 0x9f : b === 0xf4 ? 0x8f : 0xbf
  if (second < low || second > high) return 0
  for (let k = 2; k < length; k++) if ((bytes[i + k]! & 0xc0) !== 0x80) return 0
  return length
}

/** True when `bytes` is entirely well-formed UTF-8. */
export function isUtf8(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; ) {
    const n = sequence(bytes, i)
    if (n === 0) return false
    i += n
  }
  return true
}

/** Decodes UTF-8, replacing each ill-formed byte with U+FFFD. */
export function fromUtf8(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; ) {
    const n = sequence(bytes, i)
    if (n === 0) {
      out += '�'
      i++
      continue
    }
    const b = bytes[i]!
    let cp = n === 1 ? b : b & (0xff >>> (n + 1))
    for (let k = 1; k < n; k++) cp = (cp << 6) | (bytes[i + k]! & 0x3f)
    out += String.fromCodePoint(cp)
    i += n
  }
  return out
}
