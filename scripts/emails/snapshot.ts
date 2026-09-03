/**
 * Renders every template against every fixture and writes the result to a
 * labelled snapshot directory, so two engines can be compared later.
 *
 *   yarn email:snapshot --engine legacy --label before
 *   yarn email:snapshot --engine mjml   --label after
 *   yarn email:report before after
 *
 * HTML is written verbatim (that is the artifact screenshots are taken from);
 * the semantic digest beside it is what the comparison actually gates on.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CASES, TEMPLATES, fixtureFor, type Case } from './fixtures'
import { render, type Engine } from './renderers'
import { digest, digestToText } from './semantic'
import { SNAPSHOT_ROOT } from './paths'

function arg(name: string, fallback?: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (hit) return hit.slice(`--${name}=`.length)
  const flag = process.argv.indexOf(`--${name}`)
  if (flag !== -1 && process.argv[flag + 1]) return process.argv[flag + 1]
  if (fallback !== undefined) return fallback
  throw new Error(`Missing required --${name}`)
}

async function main() {
  const engine = arg('engine') as Engine
  const label = arg('label', engine)
  const outDir = join(SNAPSHOT_ROOT, label)

  await rm(outDir, { recursive: true, force: true })
  await mkdir(join(outDir, 'html'), { recursive: true })
  await mkdir(join(outDir, 'semantic'), { recursive: true })

  const entries: Array<{
    template: string
    case: Case
    bytes: number
    dangerous: string[]
  }> = []

  for (const template of TEMPLATES) {
    for (const testCase of CASES) {
      const name = `${template}.${testCase}`
      const html = await render(
        engine,
        template,
        fixtureFor(template, testCase),
      )
      const d = digest(html)

      await writeFile(join(outDir, 'html', `${name}.html`), html, 'utf8')
      await writeFile(
        join(outDir, 'semantic', `${name}.txt`),
        digestToText(d),
        'utf8',
      )
      entries.push({
        template,
        case: testCase,
        bytes: html.length,
        dangerous: d.dangerous,
      })
    }
  }

  await writeFile(
    join(outDir, 'manifest.json'),
    JSON.stringify(
      { engine, label, generatedFrom: 'scripts/emails/snapshot.ts', entries },
      null,
      2,
    ),
    'utf8',
  )

  const unsafe = entries.filter((e) => e.dangerous.length > 0)
  console.log(
    `[${label}] wrote ${entries.length} renders (${TEMPLATES.length} templates x ${CASES.length} cases) to ${outDir}`,
  )
  if (unsafe.length) {
    console.log(`\n  ${unsafe.length} render(s) contain executable content:`)
    for (const e of unsafe) {
      console.log(`    ${e.template}.${e.case}: ${e.dangerous.join(' | ')}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
