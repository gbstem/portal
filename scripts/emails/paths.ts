import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** Repository root for the admin app. */
export const REPO_ROOT = resolve(here, '..', '..')

/**
 * Browsable output of `yarn email:preview`. Gitignored: every file here is
 * regenerable from the templates plus `fixtures.ts`. The committed regression
 * gate is `src/lib/emails/__goldens__` instead.
 */
export const PREVIEW_ROOT = join(REPO_ROOT, '.email-preview')

/** Committed semantic digests - small, text, reviewable in a pull request. */
export const GOLDEN_ROOT = join(
  REPO_ROOT,
  'src',
  'lib',
  'emails',
  '__goldens__',
)
