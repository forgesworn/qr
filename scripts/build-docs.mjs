// Publish the same reviewed Markdown as HTML and plain text, without browser JS.
import { marked } from 'marked'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strict as assert } from 'node:assert'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = resolve(root, '_site')
const origin = 'https://forgesworn.github.io/qr/'
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json')))
const pages = [
  ['docs/index.md', 'index.html', 'QR code encoder and decoder for TypeScript and WebAssembly'],
  ['README.md', 'guide.html', 'Install, integrate and use the QR API'],
  ['docs/CHOOSING.md', 'choosing.html', 'Choosing QR: accuracy, benchmarks and alternatives'],
  ['SPEC.md', 'spec.html', 'QR encoder and decoder specification'],
  ['PERFORMANCE.md', 'performance.html', 'QR accuracy and performance evidence'],
  ['CHANGELOG.md', 'changelog.html', 'QR release notes'],
  ['SECURITY.md', 'security.html', 'QR security reporting and boundaries'],
  ['docs/DISTRIBUTION.md', 'distribution.html', 'QR downloads and distribution'],
]
const read = name => readFileSync(resolve(root, name), 'utf8')
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const plainText = ['README.md', 'docs/CHOOSING.md', 'docs/DISTRIBUTION.md', 'rust/README.md', 'SPEC.md', 'SECURITY.md']
const full = `# @forgesworn/qr ${pkg.version}\n\nCanonical documentation: ${origin}\nGenerated from the versioned repository documents.\n\n` + plainText.map(name => {
  const markdown = read(name).trim().replace(/\]\(([^\s)]+)\)/g, (match, href) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return match
    return `](${new URL(href, `https://github.com/forgesworn/qr/blob/main/${name}`).href})`
  })
  return `<!-- Source: ${name} -->\n\n${markdown}\n`
}).join('\n\n---\n\n')
if (process.argv.includes('--check')) {
  assert.equal(read('llms-full.txt'), full, 'llms-full.txt is stale: run npm run build:docs')
} else writeFileSync(resolve(root, 'llms-full.txt'), full)
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const links = []
const slugsByPage = new Map()
for (const [source, target, title] of pages) {
  const slugs = new Set()
  slugsByPage.set(target, slugs)
  const renderer = new marked.Renderer()
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens)
    const base = text.replace(/<[^>]*>/g, '').toLowerCase().replace(/&amp;/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-')
    let slug = base, i = 1
    while (slugs.has(slug)) slug = `${base}-${i++}`
    slugs.add(slug)
    return `<h${depth} id="${esc(slug)}">${text}</h${depth}>\n`
  }
  renderer.link = function ({ href, title, tokens }) {
    let link = href
    if (href.startsWith('#')) links.push([target, href.slice(1)])
    else if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('//')) {
      const [path, hash] = href.split('#')
      const local = relative(root, resolve(root, dirname(source), path)).replaceAll('\\', '/')
      const page = pages.find(([name]) => name === local)
      if (page) {
        link = page[1] + (hash ? `#${hash}` : '')
        if (hash) links.push([page[1], hash])
      } else if (['llms.txt', 'llms-full.txt'].includes(local)) link = local
      else link = `https://github.com/forgesworn/qr/blob/main/${local}${hash ? `#${hash}` : ''}`
    }
    assert(!/^(javascript|data|vbscript):/i.test(link), 'Unsafe documentation link')
    return `<a href="${esc(link)}"${title ? ` title="${esc(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`
  }
  const body = marked.parse(read(source), { renderer })
  const canonical = origin + (target === 'index.html' ? '' : target)
  const description = source === 'docs/index.md' ? pkg.description : `${title}. Documentation for @forgesworn/qr ${pkg.version}.`
  const schema = { '@context': 'https://schema.org', '@type': 'SoftwareSourceCode', name: '@forgesworn/qr', description: pkg.description, codeRepository: 'https://github.com/forgesworn/qr', url: origin, license: 'https://opensource.org/license/mit', programmingLanguage: ['TypeScript', 'Rust', 'Kotlin'], version: pkg.version, runtimePlatform: ['Browsers', 'Web Workers', 'Node.js 22.13+', 'Deno', 'JVM 17+', 'Native Rust'], sameAs: ['https://www.npmjs.com/package/@forgesworn/qr', 'https://jsr.io/@forgesworn/qr', 'https://crates.io/crates/forgesworn-qr', 'https://central.sonatype.com/artifact/io.github.forgesworn/qr'], author: { '@type': 'Organization', name: 'ForgeSworn', url: 'https://github.com/forgesworn' } }
  const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | ForgeSworn QR</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}"><link rel="stylesheet" href="style.css"><link rel="icon" href="icon.svg" type="image/svg+xml">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary"><link rel="sitemap" type="application/xml" href="sitemap.xml"><link rel="alternate" type="text/plain" href="llms-full.txt" title="Complete plain-text documentation">
<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script></head>
<body><a class="skip" href="#content">Skip to content</a><header><a class="brand" href="./"><img src="icon.svg" alt="" width="32" height="32">ForgeSworn <strong>QR</strong></a><nav aria-label="Main"><a href="guide.html">Guide</a><a href="choosing.html">Why QR</a><a href="performance.html">Evidence</a><a href="https://github.com/forgesworn/qr">GitHub</a></nav></header>
<main id="content"><p class="eyebrow">QR ${esc(pkg.version)} · MIT · No runtime dependencies</p>${body}</main>
<footer><p>ForgeSworn QR · <a href="distribution.html">Downloads</a> · <a href="security.html">Security</a> · <a href="llms.txt">llms.txt</a> · <a href="https://github.com/forgesworn/qr/blob/main/${source}">Page source</a></p><p>Static documentation. No analytics, cookies or third-party scripts.</p></footer></body></html>`
  writeFileSync(resolve(out, target), html)
}
for (const [page, slug] of links) assert(slugsByPage.get(page)?.has(slug), `Broken documentation anchor: ${page}#${slug}`)
for (const name of ['llms.txt', 'llms-full.txt']) writeFileSync(resolve(out, name), read(name))
writeFileSync(resolve(out, 'style.css'), read('docs/style.css'))
writeFileSync(resolve(out, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#135a48"/><path fill="#fff" d="M6 6h8v8H6zm12 0h8v8h-8zM6 18h8v8H6zm12 0h4v4h-4zm4 4h4v4h-4z"/></svg>')
writeFileSync(resolve(out, '.nojekyll'), '')
writeFileSync(resolve(out, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + pages.map(([, target]) => `<url><loc>${origin}${target === 'index.html' ? '' : target}</loc></url>`).join('') + '</urlset>\n')
console.log(`Built ${pages.length} static pages; documentation anchors and plain-text freshness checked`)
