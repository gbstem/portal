/**
 * Compiles `src/lib/emails/templates/*.mjml` into the committed
 * `src/lib/data/emailTemplates/*.ts` string modules.
 *
 * The generated modules keep the exact filenames and export names the old
 * hand-written ones had, so no call site changes and `git diff` shows the
 * migration as a pure content diff on files that already existed.
 *
 * MJML's own output is written verbatim. Do NOT add an HTML formatting pass:
 * Prettier's HTML parser rewrites the Outlook conditional comments these
 * templates depend on (`<!--[if mso | IE]>` came back as `<!--[if mso | IE ]>`
 * and `<![endif]-->` as `<! [endif]-->`), which silently breaks the Outlook
 * fallback tables. The reviewable diff for a template change is the snapshot
 * report (`yarn email:report`), not the formatting of this generated file.
 *
 *   yarn email:build          # regenerate
 *   yarn email:build --check  # fail if the committed output is stale (CI)
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import mjml2html from 'mjml'
import { REPO_ROOT } from './paths'

const EMAIL_DIR = join(REPO_ROOT, 'src', 'lib', 'emails')
const SRC_DIR = join(EMAIL_DIR, 'templates')
const OUT_DIR = join(REPO_ROOT, 'src', 'lib', 'data', 'emailTemplates')

const BANNER = (source: string) => `// GENERATED FILE - DO NOT EDIT.
// Source: src/lib/emails/templates/${source}
// Regenerate with \`yarn email:build\`. See src/lib/emails/README.md.
`

/** Makes arbitrary HTML safe to embed in a backtick template literal. */
function toTemplateLiteral(html: string): string {
  return html
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
}

export async function compileAll(): Promise<Map<string, string>> {
  const sources = (await readdir(SRC_DIR))
    .filter((f) => f.endsWith('.mjml'))
    .sort()
  const out = new Map<string, string>()

  for (const source of sources) {
    const name = basename(source, '.mjml')
    const mjml = await readFile(join(SRC_DIR, source), 'utf8')

    // MJML 5 made `mjml2html` async (it was synchronous in v4).
    // MJML 5 made `mjml2html` async and, for security, disabled `mj-include`
    // by default - it must be re-enabled and the includable roots allowlisted.
    const { html, errors } = await mjml2html(mjml, {
      filePath: join(SRC_DIR, source),
      validationLevel: 'strict',
      ignoreIncludes: false,
      includePath: [EMAIL_DIR],
    })
    if (errors?.length) {
      throw new Error(
        `${source}:\n` +
          errors.map((e) => `  ${e.formattedMessage ?? e.message}`).join('\n'),
      )
    }

    const module = `${BANNER(source)}export const ${name} = \`${toTemplateLiteral(html.trimEnd())}\`\n`
    out.set(`${name}.ts`, module)
  }

  return out
}

async function main() {
  const check = process.argv.includes('--check')
  const compiled = await compileAll()
  const stale: string[] = []

  for (const [file, contents] of compiled) {
    const path = join(OUT_DIR, file)
    const existing = await readFile(path, 'utf8').catch(() => null)
    if (existing === contents) continue
    if (check) {
      stale.push(file)
    } else {
      await writeFile(path, contents, 'utf8')
      console.log(`  ${existing === null ? 'created' : 'updated'} ${file}`)
    }
  }

  if (check && stale.length) {
    console.error(
      `These generated templates are out of date with their .mjml sources:\n` +
        stale.map((f) => `  ${f}`).join('\n') +
        `\n\nRun \`yarn email:build\` and commit the result.`,
    )
    process.exit(1)
  }
  console.log(
    check
      ? `email:build --check: ${compiled.size} template(s) up to date`
      : `email:build: ${compiled.size} template(s) compiled`,
  )
}

if (process.argv[1]?.endsWith('build.ts')) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
