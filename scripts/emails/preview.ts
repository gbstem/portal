/**
 * Renders every template to a browsable HTML file so a layout change can be
 * eyeballed before it ships.
 *
 * The semantic goldens deliberately ignore wrapper markup, which means they
 * cannot see a layout regression - a wrong padding shifts the whole email while
 * every golden stays green. That is a real gap (it happened twice while the
 * templates were being ported), so this exists to make "look at it" a one-liner:
 *
 *   yarn email:preview            # the production-shaped fixture
 *   yarn email:preview edge       # or adversarial / missing / typical
 *
 * Then open the index it prints. Output is gitignored and regenerable.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CASES, TEMPLATES, type Case } from './fixtures'
import { renderFixture } from './renderFixture'
import { PREVIEW_ROOT } from './paths'

async function main() {
  const requested = (process.argv[2] ?? 'typical') as Case
  if (!CASES.includes(requested)) {
    throw new Error(
      `Unknown fixture "${requested}". Use one of: ${CASES.join(', ')}`,
    )
  }

  await rm(PREVIEW_ROOT, { recursive: true, force: true })
  await mkdir(PREVIEW_ROOT, { recursive: true })

  for (const template of TEMPLATES) {
    await writeFile(
      join(PREVIEW_ROOT, `${template}.html`),
      renderFixture(template, requested),
      'utf8',
    )
  }

  const index = `<!doctype html>
<meta charset="utf-8">
<title>Email preview (${requested})</title>
<style>
  body { font: 14px/1.6 ui-sans-serif, system-ui, sans-serif; margin: 2rem; }
  li { margin-bottom: .35rem; }
</style>
<h1>Email preview <small>(${requested} fixture)</small></h1>
<ul>${TEMPLATES.map((t) => `<li><a href="./${t}.html">${t}</a></li>`).join('')}</ul>
`
  await writeFile(join(PREVIEW_ROOT, 'index.html'), index, 'utf8')
  console.log(
    `email:preview: wrote ${TEMPLATES.length} email(s)\n  ${join(PREVIEW_ROOT, 'index.html')}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
