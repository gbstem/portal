import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** Repository root for the admin app. */
export const REPO_ROOT = resolve(here, '..', '..')

/**
 * Rendered HTML, screenshots and reports. Gitignored: every file here is
 * regenerable from the templates plus `fixtures.ts`, and the PNGs are large.
 * The committed regression gate is `src/lib/emails/__goldens__` instead.
 */
export const SNAPSHOT_ROOT = join(REPO_ROOT, '.email-snapshots')

/** Committed semantic digests - small, text, reviewable in a pull request. */
export const GOLDEN_ROOT = join(
  REPO_ROOT,
  'src',
  'lib',
  'emails',
  '__goldens__',
)
