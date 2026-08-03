import { handle } from '../src/hooks.server'
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
