/**
 * Firestore error codes that mean "the transport hiccuped, ask again" rather
 * than "this request is wrong". A dropped WebChannel stream surfaces as
 * `unavailable`, which is the failure that used to reject whole page loads.
 */
const transientErrorCodes = new Set([
  'aborted',
  'cancelled',
  'deadline-exceeded',
  'internal',
  'resource-exhausted',
  'unavailable',
  'unknown',
])

function isTransientError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' && transientErrorCodes.has(code)
}

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Runs a read, retrying transient transport failures with a short exponential
 * backoff. Only use this for operations that are safe to repeat — the reads it
 * wraps have no side effects.
 *
 * Non-transient errors (`permission-denied`, `not-found`, ...) rethrow
 * immediately: retrying those only delays a real error the caller must show.
 */
export async function retryTransient<T>(
  operation: () => Promise<T>,
  options: { label: string; attempts?: number; baseDelayMs?: number },
): Promise<T> {
  const { label, attempts = 3, baseDelayMs = 300 } = options
  for (let attempt = 1; ; ++attempt) {
    try {
      return await operation()
    } catch (err) {
      if (attempt >= attempts || !isTransientError(err)) {
        throw err
      }
      console.warn(
        `[retry] Transient failure reading ${label}, retrying (${attempt}/${attempts - 1}):`,
        err,
      )
      await wait(baseDelayMs * 2 ** (attempt - 1))
    }
  }
}
