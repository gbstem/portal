import {
  verifyAuthenticated,
  verifyStudent,
  handleApiError,
} from '../src/lib/server/apiHelpers'
import { error as createError } from '@sveltejs/kit'
import { z } from 'zod'

/**
 * Calls `fn` and returns whatever it throws, or `undefined` if it doesn't -
 * so the assertions below run unconditionally instead of inside a
 * try/catch, where a function that stops throwing would silently skip them.
 */
function captureThrown(fn: () => unknown): any {
  try {
    fn()
  } catch (err) {
    return err
  }
  return undefined
}

describe('apiHelpers', () => {
  describe('verifyAuthenticated', () => {
    it('throws 401 if user is not signed in', () => {
      const locals = {} as App.Locals
      const err = captureThrown(() => verifyAuthenticated(locals))
      expect(err.status).toBe(401)
      expect(err.body.message).toBe('User not signed in.')
    })

    it('returns the user if signed in', () => {
      const user = { uid: '456', role: 'student' }
      const locals = { user } as any as App.Locals
      const result = verifyAuthenticated(locals)
      expect(result).toBe(user)
    })
  })

  describe('verifyStudent', () => {
    it('throws 401 if user is not signed in', () => {
      expect(() => verifyStudent({} as App.Locals)).toThrow(
        expect.objectContaining({ status: 401 }),
      )
    })

    it('throws 403 for a signed-in instructor', () => {
      const locals = {
        user: { uid: '123', role: 'instructor' },
      } as any as App.Locals
      expect(() => verifyStudent(locals)).toThrow(
        expect.objectContaining({
          status: 403,
          body: { message: 'Only student accounts can do that.' },
        }),
      )
    })

    it('returns the user for a student account', () => {
      const user = { uid: '456', role: 'student' }
      const locals = { user } as any as App.Locals
      expect(verifyStudent(locals)).toBe(user)
    })
  })

  describe('handleApiError', () => {
    let consoleSpy: jest.SpyInstance

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    it('re-throws HttpError as-is', () => {
      const httpErr = captureThrown(() => createError(404, 'Not found'))
      const err = captureThrown(() => handleApiError('test/route', httpErr))
      expect(err).toBe(httpErr)
    })

    it('handles ZodError with formatted path and message', () => {
      const schema = z.object({ email: z.string().email() })
      const result = schema.safeParse({ email: 'invalid' })
      expect(result.success).toBe(false)
      const zodError = (result as z.SafeParseError<{ email: string }>).error
      const err = captureThrown(() => handleApiError('test/route', zodError))
      expect(err.status).toBe(400)
      expect(err.body.message).toContain('Validation failed: email:')
    })

    it('handles string errors', () => {
      const err = captureThrown(() =>
        handleApiError('test/route', 'Direct string error'),
      )
      expect(err.status).toBe(400)
      expect(err.body.message).toBe('Direct string error')
    })

    it('handles Error instances', () => {
      const err = captureThrown(() =>
        handleApiError('test/route', new Error('Something broke')),
      )
      expect(err.status).toBe(400)
      expect(err.body.message).toBe('Something broke')
    })

    it('handles object with errorInfo.message', () => {
      const errWithInfo = { errorInfo: { message: 'Firebase auth error' } }
      const err = captureThrown(() => handleApiError('test/route', errWithInfo))
      expect(err.status).toBe(400)
      expect(err.body.message).toBe('Firebase auth error')
    })

    it('handles object with errorInfo and empty message', () => {
      const errWithEmptyInfo = { errorInfo: { message: '' } }
      const err = captureThrown(() =>
        handleApiError('test/route', errWithEmptyInfo),
      )
      expect(err.status).toBe(400)
      expect(err.body.message).toBe(
        'Please wait a few minutes before trying again.',
      )
    })

    it('handles object with message string property', () => {
      const errWithMsg = { message: 'Object error message' }
      const err = captureThrown(() => handleApiError('test/route', errWithMsg))
      expect(err.status).toBe(400)
      expect(err.body.message).toBe('Object error message')
    })

    it('handles unknown error types with fallback message', () => {
      const err = captureThrown(() => handleApiError('test/route', 12345))
      expect(err.status).toBe(400)
      expect(err.body.message).toBe('Something went wrong. Please try again.')
    })
  })
})
