// Resolver hook that teaches plain Node/tsx the `$lib/*` alias SvelteKit
// provides at build time, so the email tooling in this directory can import
// production modules (`$lib/utils`, `$lib/data/emailTemplates/*`) directly
// rather than keeping a drifting copy of them.
import { pathToFileURL } from 'node:url'
import { resolve as resolvePath, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const libRoot = resolvePath(here, '..', '..', 'src', 'lib')

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '$lib' || specifier.startsWith('$lib/')) {
    const rest = specifier === '$lib' ? '' : specifier.slice('$lib/'.length)
    return nextResolve(pathToFileURL(resolvePath(libRoot, rest)).href, context)
  }
  return nextResolve(specifier, context)
}
