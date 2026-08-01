import { retryTransient } from '$lib/services/retry'

/** A Firestore-shaped error, which is what `retryTransient` keys off of. */
function firestoreError(code: string) {
  return Object.assign(new Error(code), { code })
}

describe('retryTransient', () => {
  // Zero backoff keeps these fast; production callers use the 300ms default.
  const options = { label: 'test read', baseDelayMs: 0 }

  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('returns the result without retrying when the operation succeeds', async () => {
    const operation = jest.fn().mockResolvedValue('ok')

    await expect(retryTransient(operation, options)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('retries a transient failure and returns the eventual success', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(firestoreError('unavailable'))
      .mockResolvedValue('ok')

    await expect(retryTransient(operation, options)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('test read'),
      expect.any(Error),
    )
  })

  it('gives up after the attempt limit and throws the last error', async () => {
    const operation = jest
      .fn()
      .mockRejectedValue(firestoreError('deadline-exceeded'))

    await expect(retryTransient(operation, options)).rejects.toThrow(
      'deadline-exceeded',
    )
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('honours a custom attempt limit', async () => {
    const operation = jest.fn().mockRejectedValue(firestoreError('internal'))

    await expect(
      retryTransient(operation, { ...options, attempts: 5 }),
    ).rejects.toThrow('internal')
    expect(operation).toHaveBeenCalledTimes(5)
  })

  it.each([
    'aborted',
    'cancelled',
    'deadline-exceeded',
    'internal',
    'resource-exhausted',
    'unavailable',
    'unknown',
  ])('treats %s as transient', async (code) => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(firestoreError(code))
      .mockResolvedValue('ok')

    await expect(retryTransient(operation, options)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it.each(['permission-denied', 'unauthenticated', 'not-found'])(
    'rethrows %s immediately rather than delaying a real error',
    async (code) => {
      const operation = jest.fn().mockRejectedValue(firestoreError(code))

      await expect(retryTransient(operation, options)).rejects.toThrow(code)
      expect(operation).toHaveBeenCalledTimes(1)
    },
  )

  it('treats an error with no Firestore code as non-transient', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('boom'))

    await expect(retryTransient(operation, options)).rejects.toThrow('boom')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('backs off exponentially between attempts', async () => {
    const delays: number[] = []
    const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      delays.push(ms ?? 0)
      fn()
      return 0 as unknown as NodeJS.Timeout
    }) as unknown as typeof setTimeout)
    const operation = jest.fn().mockRejectedValue(firestoreError('unavailable'))

    await expect(
      retryTransient(operation, { label: 'test read', attempts: 4 }),
    ).rejects.toThrow('unavailable')

    expect(delays).toEqual([300, 600, 1200])
    timeoutSpy.mockRestore()
  })
})
