/**
 * Renders a transactional email.
 *
 * Replaces the hand-rolled `addDataToHtmlTemplate` substituter. Two things
 * changed, both deliberate:
 *
 *  - Interpolation goes through Handlebars, which escapes by default. The old
 *    `escapeHtml` did too, but every new template was one forgotten call away
 *    from not doing so.
 *  - URLs are sanitised. The old path escaped HTML metacharacters but never
 *    looked at the scheme, so `javascript:...` in a name or link field reached
 *    the recipient's `href` intact in 9 of the 11 templates. Anything
 *    interpolated into an `href` now goes through the `url` helper, which only
 *    lets http/https/mailto through.
 */
import Handlebars from 'handlebars'
import { EMAIL_TEMPLATES, type EmailTemplateName } from './registry'

/** Schemes that are safe to put in an email `href`. */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/**
 * Escapes for an attribute value without touching `=`, `'` or backtick the way
 * Handlebars' general-purpose escaper does - query strings stay readable, and
 * the characters that could terminate the attribute are still neutralised.
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function safeUrl(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (raw === '') return ''
  let parsed: URL
  try {
    // Relative URLs resolve against a throwaway base purely so the scheme can
    // be inspected; only the original string is ever emitted.
    parsed = new URL(raw, 'https://gbstem.org')
  } catch {
    return ''
  }
  if (!SAFE_SCHEMES.has(parsed.protocol)) return ''
  return escapeAttribute(raw)
}

const handlebars = Handlebars.create()

handlebars.registerHelper(
  'url',
  (value: unknown) => new handlebars.SafeString(safeUrl(value)),
)

const compiled = new Map<string, Handlebars.TemplateDelegate>()

function templateFor(name: EmailTemplateName): Handlebars.TemplateDelegate {
  let template = compiled.get(name)
  if (!template) {
    const source = EMAIL_TEMPLATES[name]
    if (source === undefined) {
      throw new Error(`Unknown email template: ${name}`)
    }
    // `strict: false` keeps the old behaviour of rendering an unknown key as
    // the empty string rather than throwing at send time.
    template = handlebars.compile(source, { strict: false, noEscape: false })
    compiled.set(name, template)
  }
  return template
}

export type EmailData = Record<string, unknown>

/**
 * `data` is the same object the old call sites passed as `template.data`.
 * `footerYear` is filled in automatically so the footer's copyright never goes
 * stale again - the previous templates were hardcoded to 2023 and 2024. It is
 * deliberately top-level rather than `app.year`: portal's community-service
 * email already uses `app.year` for the semester year, and the layout partials
 * are meant to be identical in both repos.
 */
export function renderEmail(name: string, data: EmailData): string {
  return templateFor(name as EmailTemplateName)({
    footerYear: new Date().getFullYear(),
    ...data,
  })
}
