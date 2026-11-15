// UTF-8 decoding without TextDecoder, which ES2022 does not guarantee, and
// other character sets through TextDecoder when the platform has it.

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

interface Decoder {
  decode(input: Uint8Array): string
}

/** ECI assignment numbers to platform charset labels. 1, 3, 26 and 27 are handled by hand. */
const LABELS: Readonly<Record<number, string>> = {
  4: 'iso-8859-2', 5: 'iso-8859-3', 6: 'iso-8859-4', 7: 'iso-8859-5', 8: 'iso-8859-6', 9: 'iso-8859-7',
  10: 'iso-8859-8', 11: 'iso-8859-9', 12: 'iso-8859-10', 13: 'iso-8859-11', 15: 'iso-8859-13',
  16: 'iso-8859-14', 17: 'iso-8859-15', 18: 'iso-8859-16', 20: 'shift_jis', 21: 'windows-1250',
  22: 'windows-1251', 23: 'windows-1252', 24: 'windows-1256', 25: 'utf-16be', 28: 'big5',
  29: 'gb18030', 30: 'euc-kr', 31: 'gb18030', 32: 'gb18030', 33: 'utf-16le',
}

/** Bytes the Windows code pages leave undefined; platforms disagree on them, so they are U+FFFD. */
const UNDEFINED: Readonly<Record<number, readonly number[]>> = {
  21: [0x81, 0x83, 0x88, 0x90, 0x98],
  22: [0x98],
  23: [0x81, 0x8d, 0x8f, 0x90, 0x9d],
}

const decoders = new Map<string, Decoder | undefined>()

function decoderFor(label: string): Decoder | undefined {
  if (decoders.has(label)) return decoders.get(label)
  let found: Decoder | undefined
  try {
    const Ctor = (globalThis as { TextDecoder?: new (label: string, options: { ignoreBOM: boolean }) => Decoder }).TextDecoder
    // ignoreBOM keeps a leading U+FEFF, as the JVM does.
    found = Ctor === undefined ? undefined : new Ctor(label, { ignoreBOM: true })
  } catch {
    found = undefined // the platform does not know this label
  }
  decoders.set(label, found)
  return found
}

/**
 * Text for `bytes` under an ECI assignment other than 1, 3 and 26, or
 * undefined when the platform lacks the character set (the caller then falls
 * back). Malformed input becomes U+FFFD.
 */
export function fromEci(eci: number, bytes: Uint8Array): string | undefined {
  if (eci === 27 || eci === 170) {
    // US-ASCII and the ISO 646 invariant set: platforms disagree on high bytes, so none is a character.
    let s = ''
    for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : '\ufffd'
    return s
  }
  const label = LABELS[eci]
  if (label === undefined) return undefined
  const decoder = decoderFor(label)
  if (decoder === undefined) return undefined
  const text = decoder.decode(bytes)
  const iso = eci >= 4 && eci <= 18
  const undefinedBytes = UNDEFINED[eci]
  if ((!iso && undefinedBytes === undefined) || text.length !== bytes.length) return text
  // Single-byte sets are one unit a byte. ISO 8859 puts C1 controls at 0x80-0x9F,
  // whatever label aliasing a platform applies.
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    if (iso && b >= 0x80 && b <= 0x9f) out += String.fromCharCode(b)
    else if (undefinedBytes?.includes(b)) out += '\ufffd'
    else out += text[i]
  }
  return out
}

/**
 * The text of one kanji-mode character, given its Shift_JIS bytes: what the
 * platform makes of them, or U+FFFD alone if it makes nothing clean of them or
 * has no Shift_JIS.
 */
export function kanjiText(sjis: number): string {
  const text = decoderFor('shift_jis')?.decode(Uint8Array.of(sjis >>> 8, sjis & 0xff))
  return text === undefined || text.includes('\ufffd') ? '\ufffd' : text
}

/**
 * Twelve cells GB2312 leaves empty that GBK and older GB 18030 tables make
 * private-use and newer GB 18030 tables make characters; platforms disagree,
 * so they reject a hanzi symbol like any other empty cell.
 */
function editionDependent(lead: number, low: number): boolean {
  if (lead === 0xa6) return (low >= 0xd9 && low <= 0xdf) || low === 0xec || low === 0xed || low === 0xf3
  return lead === 0xa8 && (low === 0xbc || low === 0xbf)
}

/**
 * The text of one hanzi-mode character, given its GB2312 lead and low bytes: what the
 * platform's GB 18030 makes of them, or U+FFFD alone if the platform has none.
 * Undefined, rejecting the symbol, when the pair is outside the GB2312 rows
 * (A1-A9 and B0-F7, cells A1-FE) or names no character: the platform answers
 * with U+FFFD or a private-use character for an empty cell.
 */
export function hanziText(lead: number, low: number): string | undefined {
  if (low < 0xa1 || low > 0xfe || lead < 0xa1 || lead > 0xf7 || (lead > 0xa9 && lead < 0xb0)) return undefined
  if (editionDependent(lead, low)) return undefined
  const decoder = decoderFor('gb18030')
  if (decoder === undefined) return '�'
  const text = decoder.decode(Uint8Array.of(lead, low))
  const cp = text.codePointAt(0)
  if (cp === undefined || text.length !== (cp > 0xffff ? 2 : 1) || cp === 0xfffd || (cp >= 0xe000 && cp <= 0xf8ff)) return undefined
  return text
}

/**
 * Whether bytes that are not valid UTF-8 and carry no ECI look like Shift_JIS
 * rather than Latin-1. Scanning left to right, a byte below 0x80 is skipped;
 * 0xA1 to 0xDF is a half-width katakana; 0x81 to 0x9F or 0xE0 to 0xEF followed
 * by 0x40 to 0x7E or 0x80 to 0xFC is a double-byte character; anything else of
 * 0x80 or more (0x80, 0xA0, 0xF0 to 0xFF, or a lead without a trail) rules
 * Shift_JIS out. With none ruled out, it is Shift_JIS if the bytes hold three
 * katakana in a row, three double-byte characters in a row, or a double-byte
 * character whose lead is 0x81 to 0x9F (a control in Latin-1, so never text
 * there); otherwise it is Latin-1.
 */
export function looksShiftJis(bytes: Uint8Array): boolean {
  let kana = 0
  let pairs = 0
  let strong = false
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!
    if (b < 0x80) {
      kana = 0
      pairs = 0
      i++
    } else if (b >= 0xa1 && b <= 0xdf) {
      pairs = 0
      if (++kana >= 3) strong = true
      i++
    } else if ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xef)) {
      const t = bytes[i + 1]
      if (t === undefined || t < 0x40 || t === 0x7f || t > 0xfc) return false
      kana = 0
      if (++pairs >= 3 || b <= 0x9f) strong = true
      i += 2
    } else {
      return false
    }
  }
  return strong
}
