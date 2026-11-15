import { type QrCode } from './encode.js'

export interface SvgOptions {
  /** Quiet zone in modules on every side. Default 4, the standard's minimum. */
  margin?: number
  /** Colour of dark modules. Default `'#000'`. */
  dark?: string
  /** Background colour, or `null` for none. Default `'#fff'`. */
  light?: string | null
  /** Accessible name, written as the SVG `<title>`. An empty string adds none. */
  title?: string
}

/**
 * Renders a code as a standalone SVG document, one module per user unit and
 * one path for all dark modules. Size it with CSS or `width`/`height`; the
 * viewBox keeps it square.
 */
export function toSvg(qr: QrCode, options: SvgOptions = {}): string {
  const margin = options.margin ?? 4
  if (!Number.isInteger(margin) || margin < 0) throw new RangeError('Margin must be a whole number of modules')
  const light = options.light === undefined ? '#fff' : options.light
  const name = options.title ?? ''
  if (typeof (options.dark ?? '') !== 'string') throw new TypeError('dark must be a colour string')
  if (light !== null && typeof light !== 'string') throw new TypeError('light must be a colour string or null')
  if (typeof name !== 'string') throw new TypeError('title must be a string')
  const dark = escape(options.dark ?? '#000')
  const side = qr.size + margin * 2
  let path = ''
  for (let y = 0; y < qr.size; y++) {
    let x = 0
    while (x < qr.size) {
      if (qr.modules[y * qr.size + x] !== 1) {
        x++
        continue
      }
      const start = x
      while (x < qr.size && qr.modules[y * qr.size + x] === 1) x++
      path += `M${start + margin} ${y + margin}h${x - start}v1h${start - x}z`
    }
  }
  const title = name === '' ? '' : `<title>${escape(name)}</title>`
  const background = light === null ? '' : `<rect width="${side}" height="${side}" fill="${escape(light)}"/>`
  const role = name === '' ? '' : ' role="img"'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"${role}>` +
    `${title}${background}<path fill="${dark}" d="${path}"/></svg>`
  )
}

/**
 * Escapes text for an attribute or element. Characters XML 1.0 does not
 * allow (most C0 controls, lone surrogates, U+FFFE and U+FFFF) become U+FFFD,
 * so the document always parses.
 */
function escape(text: string): string {
  return text.replace(
    /[\uD800-\uDBFF][\uDC00-\uDFFF]|[&<>"']|[\0-\x08\x0B\x0C\x0E-\x1F\uD800-\uDFFF\uFFFE\uFFFF]/g,
    (c) => (c.length === 2 ? c : '&<>"\''.includes(c) ? `&#${c.charCodeAt(0)};` : '\ufffd'),
  )
}
