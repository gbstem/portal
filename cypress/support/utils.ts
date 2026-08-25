// Use this to include a unique hash within new records to help ensure edits
// really work as expected, rather than seeing stale data from a previous test run.
export const generateDateHash = (prefix: string): string => {
  if (!prefix) {
    throw new Error('Prefix is required for generateDateHash')
  }
  const hash = Date.now().toString().slice(-8)
  if (prefix.endsWith('.')) {
    return `${prefix.slice(0, -1)} ${hash}.`
  }
  if (prefix.includes(' ')) {
    return `${prefix} ${hash}`
  }
  return `${prefix}-${hash}`
}

/**
 * Prepares a document read back through `cy.getFirestoreDoc` for a
 * whole-document deep-equal against an expected shape.
 *
 * Two things have to be normalized away first:
 *
 * - `timestamps` is dropped. It holds `serverTimestamp()` sentinels, and
 *   `getFirestoreDoc`'s REST value converter has no `timestampValue` branch, so
 *   they come back as raw `{ timestampValue }` wrappers rather than dates.
 * - The arrays named in `sortArraysAt` are sorted. Svelte's `bind:group`
 *   appends in the order boxes are ticked, so a checkbox group's stored order
 *   reflects click order rather than anything meaningful - pinning it would
 *   make these tests fail for the wrong reason.
 *
 * Deep-equal rather than per-field assertions is the point: a field added to a
 * form's schema but never wired through to the write path shows up here as an
 * unexpected default, whereas a list of `expect(data.x).to.equal(y)` lines only
 * ever checks the fields someone remembered to add.
 */
export const prepareDocForCompare = (
  doc: Record<string, any>,
  sortArraysAt: string[] = [],
): Record<string, any> => {
  const { timestamps: _timestamps, ...rest } = doc
  const copy = JSON.parse(JSON.stringify(rest))
  for (const path of sortArraysAt) {
    const keys = path.split('.')
    const last = keys.pop() as string
    let cursor = copy
    for (const key of keys) {
      if (cursor === null || cursor === undefined) break
      cursor = cursor[key]
    }
    if (cursor && Array.isArray(cursor[last])) {
      cursor[last] = [...cursor[last]].sort()
    }
  }
  return copy
}
