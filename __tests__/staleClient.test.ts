import { shouldHardLoad } from '$lib/client/staleClient'

// StaleClientBanner.svelte and staleClient.ts are byte-identical to admin's
// copies. The component-mounting half of the coverage lives in admin's
// StaleClientBanner.svelte.test.ts, which is where the `$app/*` jest mocks are
// configured (see admin's __mocks__/sveltekit/README.md); this repo has no such
// mapping, so only the pure decision helper is exercised here.
//
// The guard's effect - assigning `location.href` - is not covered in either
// repo: jsdom's `window.location` is non-configurable and its `reload` is
// read-only, so neither can be intercepted. The decision that precedes it is
// what can regress.
describe('shouldHardLoad', () => {
  const to = { url: new URL('http://localhost/classes') }

  it('hard-loads a normal navigation from a stale tab', () => {
    expect(shouldHardLoad(true, { willUnload: false, to })).toBe(true)
  })

  it('leaves a current tab alone', () => {
    expect(shouldHardLoad(false, { willUnload: false, to })).toBe(false)
  })

  it('stays out of the way when the browser is leaving the app anyway', () => {
    expect(shouldHardLoad(true, { willUnload: true, to })).toBe(false)
  })

  it('does nothing without a destination url', () => {
    expect(shouldHardLoad(true, { willUnload: false, to: null })).toBe(false)
    expect(shouldHardLoad(true, { willUnload: false })).toBe(false)
  })
})
