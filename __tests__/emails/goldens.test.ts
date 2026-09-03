/**
 * Regression gate for the transactional emails.
 *
 * Every template is rendered against every fixture and reduced to a semantic
 * digest - the text, links, images and headings a recipient actually sees -
 * which is compared against the committed goldens in
 * `src/lib/emails/__goldens__`. Wrapper markup is deliberately excluded so
 * MJML version bumps don't produce noise, while a changed sentence or a
 * broken link fails loudly.
 *
 * If a diff here is intended, run `yarn email:goldens` and commit the result.
 */
import { describe, it, expect } from '@jest/globals'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CASES, TEMPLATES } from '../../scripts/emails/fixtures'
import { renderFixture } from '../../scripts/emails/renderFixture'
import { digest, digestToText } from '../../scripts/emails/semantic'

const GOLDEN_DIR = join(
  __dirname,
  '..',
  '..',
  'src',
  'lib',
  'emails',
  '__goldens__',
)

describe('email goldens', () => {
  it('has a golden for every template and case, and no orphans', () => {
    const expected = TEMPLATES.flatMap((t) =>
      CASES.map((c) => `${t}.${c}.txt`),
    ).sort()
    expect(readdirSync(GOLDEN_DIR).sort()).toEqual(expected)
  })

  for (const template of TEMPLATES) {
    for (const testCase of CASES) {
      it(`${template} (${testCase}) matches its golden`, () => {
        const actual = digestToText(digest(renderFixture(template, testCase)))
        const golden = readFileSync(
          join(GOLDEN_DIR, `${template}.${testCase}.txt`),
          'utf8',
        )
        expect(actual).toBe(golden)
      })
    }
  }

  it('never emits executable content, whatever the input', () => {
    const offenders: string[] = []
    for (const template of TEMPLATES) {
      for (const testCase of CASES) {
        const { dangerous } = digest(renderFixture(template, testCase))
        if (dangerous.length)
          offenders.push(`${template}.${testCase}: ${dangerous.join(', ')}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
