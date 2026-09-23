/**
 * Whether a pending navigation should be turned into a full page load.
 *
 * Split out of StaleClientBanner.svelte so the branch logic is unit-testable:
 * jsdom's `window.location` is non-configurable and its `reload` is read-only,
 * so a component test cannot observe the assignment the guard performs - only
 * the decision that precedes it.
 *
 * `willUnload` means the browser is leaving the app anyway (an external link, a
 * closing tab); forcing a load of our own there is pointless and would fight
 * the navigation already underway. A navigation with no destination url has
 * nothing to load either.
 */
export function shouldHardLoad(
  isStale: boolean,
  nav: { willUnload: boolean; to?: { url: URL } | null },
): boolean {
  return isStale && !nav.willUnload && Boolean(nav.to?.url)
}
