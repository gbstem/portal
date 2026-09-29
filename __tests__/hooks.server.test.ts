import { handle, handleError } from '../src/hooks.server'
import { adminAuth } from '$lib/server/firebase'

function createEvent(sessionCookie?: string) {
  return {
    cookies: {
      get: jest.fn((name: string) =>
        name === '__session' ? sessionCookie : undefined,
      ),
    },
    locals: {} as App.Locals,
  } as any
}

describe('hooks.server handle', () => {
  const resolve = jest.fn().mockResolvedValue('resolved-response')

  beforeEach(() => {
    resolve.mockClear()
    ;(adminAuth.verifySessionCookie as jest.Mock).mockReset()
    ;(adminAuth.getUser as jest.Mock).mockReset()
  })

  it('sets locals.user and resolves the request for a student session', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({
      uid: 'uid-1',
    })
    ;(adminAuth.getUser as jest.Mock).mockResolvedValue({
      uid: 'uid-1',
      email: 'student@example.com',
      emailVerified: true,
      customClaims: { role: 'student' },
    })
    const event = createEvent('cookie-value')

    const result = await handle({ event, resolve } as any)

    expect(event.locals.user).toEqual({
      uid: 'uid-1',
      email: 'student@example.com',
      emailVerified: true,
      role: 'student',
    })
    expect(resolve).toHaveBeenCalledWith(event)
    expect(result).toBe('resolved-response')
  })

  it('sets locals.user and resolves the request for an instructor session', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({
      uid: 'uid-2',
    })
    ;(adminAuth.getUser as jest.Mock).mockResolvedValue({
      uid: 'uid-2',
      email: 'instructor@example.com',
      emailVerified: true,
      customClaims: { role: 'instructor' },
    })
    const event = createEvent('cookie-value')

    await handle({ event, resolve } as any)

    expect(event.locals.user?.role).toBe('instructor')
    expect(resolve).toHaveBeenCalledWith(event)
  })

  // Regression test: redirect() throws immediately (matching real
  // @sveltejs/kit), and was previously called inside the try block, so its
  // throw was silently swallowed by the surrounding catch and the redirect
  // never happened. It must now propagate out of handle().
  it('redirects admin/other roles to the admin site instead of silently continuing', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({
      uid: 'uid-3',
    })
    ;(adminAuth.getUser as jest.Mock).mockResolvedValue({
      uid: 'uid-3',
      email: 'admin@example.com',
      emailVerified: true,
      customClaims: { role: 'admin' },
    })
    const event = createEvent('cookie-value')

    let thrown: any
    try {
      await handle({ event, resolve } as any)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeDefined()
    expect(thrown.status).toBe(301)
    expect(thrown.location).toBe('https://admin.gbstem.org')
    expect(event.locals.user).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('sets locals.user to null and resolves without redirecting when there is no session cookie', async () => {
    const event = createEvent(undefined)

    const result = await handle({ event, resolve } as any)

    expect(event.locals.user).toBeNull()
    expect(adminAuth.verifySessionCookie).not.toHaveBeenCalled()
    expect(resolve).toHaveBeenCalledWith(event)
    expect(result).toBe('resolved-response')
  })

  it('sets locals.user to null and resolves without redirecting when the account has no role claim', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({
      uid: 'uid-4',
    })
    ;(adminAuth.getUser as jest.Mock).mockResolvedValue({
      uid: 'uid-4',
      email: 'noclaim@example.com',
      emailVerified: true,
      customClaims: {},
    })
    const event = createEvent('cookie-value')

    const result = await handle({ event, resolve } as any)

    expect(event.locals.user).toBeNull()
    expect(resolve).toHaveBeenCalledWith(event)
    expect(result).toBe('resolved-response')
  })
})

describe('hooks.server handleError', () => {
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  const shape = (error: unknown, status = 500, message = 'Internal Error') =>
    handleError({ error, event: {}, status, message } as any) as App.Error

  // Unauthenticated callers reach this (a malformed POST to /api/auth is
  // enough), so nothing about the server may leave in the response.
  it('returns only the generic message and an id, never the stack or raw message', () => {
    const err = new Error(
      'ENOENT: /var/task/.svelte-kit/output/server/secret.js',
    )

    const result = shape(err)

    expect(result).toEqual({
      message: 'Internal Error',
      errorId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(JSON.stringify(result)).not.toContain('ENOENT')
    expect(JSON.stringify(result)).not.toContain(err.stack!.split('\n')[1])
  })

  it('logs the full error under the id it returns', () => {
    const err = new Error('boom')

    const { errorId } = shape(err)

    expect(errorSpy).toHaveBeenCalledWith(
      `[SvelteKit Server Error ${errorId}]:`,
      err,
    )
  })

  it('gives each error its own id', () => {
    expect(shape(new Error('a')).errorId).not.toBe(
      shape(new Error('b')).errorId,
    )
  })

  it("passes a 404's message through without logging it", () => {
    const result = shape(new Error('Not found: /nope'), 404, 'Not Found')

    expect(result.message).toBe('Not Found')
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
