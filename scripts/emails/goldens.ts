/**
 * Writes the committed semantic goldens - one small text file per
 * template x fixture describing what a recipient sees.
 *
 * These are the permanent regression gate (`__tests__/emails/goldens.test.ts`
 * compares live renders against them). They are text, not HTML, so a template
 * change shows up in a pull request as a readable diff of copy and links
 * instead of thousands of lines of table markup.
 *
 *   yarn email:goldens   # accept the current output
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CASES, TEMPLATES } from './fixtures'
import { renderFixture } from './renderFixture'
import { digest, digestToText } from './semantic'
import { GOLDEN_ROOT } from './paths'

async function main() {
  await rm(GOLDEN_ROOT, { recursive: true, force: true })
  await mkdir(GOLDEN_ROOT, { recursive: true })

  let count = 0
  for (const template of TEMPLATES) {
    for (const testCase of CASES) {
      const html = renderFixture(template, testCase)
      await writeFile(
        join(GOLDEN_ROOT, `${template}.${testCase}.txt`),
        digestToText(digest(html)),
        'utf8',
      )
      count++
    }
  }
  console.log(`email:goldens: wrote ${count} golden(s) to ${GOLDEN_ROOT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
