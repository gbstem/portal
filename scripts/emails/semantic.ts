/**
 * Reduces a rendered email to what a recipient can actually perceive.
 *
 * Byte-comparing the old string templates against MJML output is not useful -
 * two generators produce different table scaffolding for the same email - so
 * the *gate* for the migration is this digest rather than the raw HTML. It
 * keeps text, links, images and headings (in document order, with entities
 * decoded by the DOM) and throws away every wrapper element, inline style and
 * Outlook conditional comment. Two emails with the same digest read
 * identically; the raw-HTML and screenshot diffs then cover presentation.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'

export type SemanticDigest = {
  title: string
  headings: string[]
  /** Visible copy, one entry per block-level run, in document order. */
  text: string[]
  links: Array<{ href: string; text: string }>
  images: Array<{ src: string; alt: string; width: string }>
  /** Anything that would make this email executable - must always be empty. */
  dangerous: string[]
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Walks block elements that contain no nested block element, so each entry is
 * one leaf-level run of copy rather than the same sentence repeated once per
 * enclosing table cell.
 */
function textRuns(root: Element): string[] {
  const runs: string[] = []
  for (const el of root.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, li, td, div, blockquote',
  )) {
    if (el.querySelector('p, h1, h2, h3, h4, h5, h6, li, td, div, blockquote'))
      continue
    const text = collapse(el.textContent ?? '')
    if (text) runs.push(text)
  }
  return runs
}

/** Attributes that would execute script if an injected value reached them. */
function dangerousBits(doc: Document): string[] {
  const found: string[] = []
  for (const script of doc.querySelectorAll('script')) {
    found.push(
      `script element: ${collapse(script.textContent ?? '').slice(0, 120)}`,
    )
  }
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) {
        found.push(
          `${el.tagName.toLowerCase()}[${attr.name}]=${attr.value.slice(0, 120)}`,
        )
      }
    }
  }
  for (const el of doc.querySelectorAll('[href], [src]')) {
    const url = el.getAttribute('href') ?? el.getAttribute('src') ?? ''
    if (/^\s*(javascript|data|vbscript):/i.test(url)) {
      found.push(`${el.tagName.toLowerCase()} url scheme: ${url.slice(0, 120)}`)
    }
  }
  return found
}

/**
 * Parses without needing a particular host.
 *
 * Under Jest the suite already runs in a jsdom environment, so the global
 * `DOMParser` is both available and the only option - importing the `jsdom`
 * package there fails, because its dependencies ship as ESM that Jest's CJS
 * loader cannot read. From the command line there is no global DOM, so jsdom
 * is loaded lazily through `require`, resolved from the working directory -
 * a static import would be hoisted and would break the Jest path again, and
 * `import.meta.url` is unavailable once ts-jest compiles this to CommonJS.
 */
function parseHtml(html: string): Document {
  // `<style>` never affects the digest, and these emails carry `@import` rules
  // that jsdom's CSS parser rejects noisily. Drop the blocks before parsing.
  const withoutStyles = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')

  if (typeof globalThis.DOMParser !== 'undefined') {
    return new globalThis.DOMParser().parseFromString(
      withoutStyles,
      'text/html',
    )
  }
  const require = createRequire(join(process.cwd(), 'package.json'))
  const { JSDOM, VirtualConsole } = require('jsdom')
  return new JSDOM(withoutStyles, { virtualConsole: new VirtualConsole() })
    .window.document
}

export function digest(html: string): SemanticDigest {
  const doc = parseHtml(html)
  const body = doc.body

  return {
    title: collapse(doc.title ?? ''),
    headings: Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(
      (h) => collapse(h.textContent ?? ''),
    ),
    text: textRuns(body),
    links: Array.from(doc.querySelectorAll('a')).map((a) => ({
      // getAttribute, not .href - jsdom resolves .href against a base URL.
      href: a.getAttribute('href') ?? '',
      text: collapse(a.textContent ?? ''),
    })),
    images: Array.from(doc.querySelectorAll('img')).map((img) => ({
      src: img.getAttribute('src') ?? '',
      alt: img.getAttribute('alt') ?? '',
      width: img.getAttribute('width') ?? '',
    })),
    dangerous: dangerousBits(doc),
  }
}

/** Human-readable, line-oriented form so `diff` output is legible. */
export function digestToText(d: SemanticDigest): string {
  const lines: string[] = []
  lines.push(`title: ${d.title}`)
  for (const h of d.headings) lines.push(`heading: ${h}`)
  for (const t of d.text) lines.push(`text: ${t}`)
  for (const l of d.links) lines.push(`link: ${l.text} -> ${l.href}`)
  for (const i of d.images)
    lines.push(`image: ${i.src} (alt=${i.alt} width=${i.width})`)
  for (const x of d.dangerous) lines.push(`DANGEROUS: ${x}`)
  return lines.join('\n') + '\n'
}
