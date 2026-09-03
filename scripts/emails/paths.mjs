// Mirror of paths.ts for the plain-JS scripts (screenshot, report), which run
// under node directly rather than through tsx.
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = resolve(here, '..', '..')
export const SNAPSHOT_ROOT = join(REPO_ROOT, '.email-snapshots')
