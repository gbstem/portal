/**
 * The two render paths under comparison.
 *
 * `legacy` is the pre-migration path: the committed template strings plus
 * `addDataToHtmlTemplate`. `mjml` is the replacement. Keeping both behind one
 * signature is what lets the snapshot and report scripts stay engine-agnostic.
 */
import { execFileSync } from 'node:child_process'
import { FIXTURE_YEAR, type TemplateData } from './fixtures'

export const ENGINES = ['legacy', 'mjml'] as const
export type Engine = (typeof ENGINES)[number]

/**
 * Git ref the legacy template strings are read from.
 *
 * They live in files the migration overwrites, so reading them out of the
 * working tree would quietly compare the new templates against themselves -
 * `addDataToHtmlTemplate` renders an MJML-era template without complaining, it
 * just leaves every `{{url ...}}` and `{{footerYear}}` blank. Pinning to a ref
 * keeps the baseline meaningful after the migration lands.
 */
export const BASELINE_REF = process.env.EMAIL_BASELINE_REF ?? 'HEAD'

/** Recovers the HTML from an `export const name = ` + backtick-quoted string. */
function extractTemplateLiteral(source: string, template: string): string {
  const declaration = source.indexOf(`export const ${template}`)
  if (declaration === -1) {
    throw new Error(
      `${template}: baseline file has no "export const ${template}"`,
    )
  }
  const start = source.indexOf('`', declaration)
  const end = source.lastIndexOf('`')
  if (start === -1 || end <= start) {
    throw new Error(
      `${template}: no template literal found in the baseline file`,
    )
  }
  return source
    .slice(start + 1, end)
    .replace(/\\`/g, '`')
    .replace(/\\\$\{/g, '${')
    .replace(/\\\\/g, '\\')
}

/**
 * Frozen copy of the pre-migration substituter (`addDataToHtmlTemplate` and its
 * private `escapeHtml`, deleted from `src/lib/utils.ts` by the migration).
 *
 * The baseline has to be rendered the way production rendered it, so this tool
 * keeps its own copy rather than importing one that no longer exists. Treat it
 * as a historical record: it should never be "fixed" or improved, including the
 * missing URL-scheme check that is exactly what the migration set out to close.
 */
function legacyEscapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function legacyAddDataToHtmlTemplate(
  html: string,
  template: { data: Record<string, unknown> },
): string {
  return html.replace(/{{(.*?)}}/g, (_: string, key: string) => {
    const keys = key.trim().split('.')
    let value: unknown = template.data
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k]
      } else {
        return ''
      }
    }
    return legacyEscapeHtml(String(value ?? ''))
  })
}

async function renderLegacy(
  template: string,
  data: TemplateData,
): Promise<string> {
  const file = `src/lib/data/emailTemplates/${template}.ts`
  const source = execFileSync('git', ['show', `${BASELINE_REF}:${file}`], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  const html = extractTemplateLiteral(source, template)

  // Guard against pointing the baseline at a ref that already contains the
  // migration - the failure is otherwise silent and looks like real drift.
  if (html.includes('{{url ') || html.includes('{{footerYear}}')) {
    throw new Error(
      `${template}: the baseline at ${BASELINE_REF} is already migrated. ` +
        `Set EMAIL_BASELINE_REF to a commit from before the MJML migration.`,
    )
  }
  return legacyAddDataToHtmlTemplate(html, data)
}

async function renderMjml(
  template: string,
  data: TemplateData,
): Promise<string> {
  let renderEmail
  try {
    ;({ renderEmail } = await import('$lib/emails/render'))
  } catch {
    throw new Error(
      'The MJML render path does not exist yet - run this with `--engine legacy` ' +
        'to capture the baseline first.',
    )
  }
  // Pin the year the render layer would otherwise take from the clock.
  return renderEmail(template, { ...data.data, footerYear: FIXTURE_YEAR })
}

export function render(
  engine: Engine,
  template: string,
  data: TemplateData,
): Promise<string> {
  return engine === 'legacy'
    ? renderLegacy(template, data)
    : renderMjml(template, data)
}
