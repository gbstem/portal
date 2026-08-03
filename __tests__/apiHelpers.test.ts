import {
  verifyAuthenticated,
  handleApiError,
} from '../src/lib/server/apiHelpers'
import { error as createError } from '@sveltejs/kit'
import { z } from 'zod'

describe('apiHelpers', () => {
  describe('verifyAuthenticated', () => {
    it('throws 401 if user is not signed in', () => {
      const locals = {} as App.Locals
      try {
        verifyAuthenticated(locals)
        fail('Should have thrown')
      } catch (err: any) {
        expect(err.status).toBe(401)
        expect(err.body.message).toBe('User not signed in.')
      }
    })

    it('returns the user if signed in', () => {
      const user = { uid: '456', role: 'student' }
      const locals = { user } as any as App.Locals
      const result = verifyAuthenticated(locals)
      expect(result).toBe(user)
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
      let httpErr: unknown
      try {
        createError(404, 'Not found')
      } catch (err) {
        httpErr = err
      }
      try {
        handleApiError('test/route', httpErr)
        fail('Should have thrown')
      } catch (err) {
        expect(err).toBe(httpErr)
      }
    })

    it('handles ZodError with formatted path and message', () => {
      const schema = z.object({ email: z.string().email() })
      const result = schema.safeParse({ email: 'invalid' })
      if (!result.success) {
        try {
          handleApiError('test/route', result.error)
          fail('Should have thrown')
        } catch (err: any) {
          expect(err.status).toBe(400)
          expect(err.body.message).toContain('Validation failed: email:')
        }
      }
    })

    it('handles string errors', () => {
      try {
        handleApiError('test/route', 'Direct string error')
        fail('Should have thrown')
      } catch (err: any) {
        expect(err.status).toBe(400)
        expect(err.body.message).toBe('Direct string error')
      }
    })

    it('handles Error instances', () => {
      try {
        handleApiError('test/route', new Error('Something broke'))
        fail('Should have thrown')
      } catch (err: any) {
        expect(err.status).toBe(400)
        expect(err.body.message).toBe('Something broke')
      }
    })

    it('handles object with errorInfo.message', () => {
      const errWithInfo = { errorInfo: { message: 'Firebase auth error' } }
      try {
        handleApiError('test/route', errWithInfo)
        fail('Should have thrown')
      } catch (err: any) {
        expect(err.status).toBe(400)
        expect(err.body.message).toBe('Firebase auth error')
      }
    })

    it('handles object with errorInfo and empty message', () => {
      const errWithEmptyInfo = { errorInfo: { message: '' } }
      try {
        handleApiError('test/route', errWithEmptyInfo)
        fail('Should have thrown')
      } catch (err: any) {
        expect(err.status).toBe(400)
        expect(err.body.message).toBe(
          'Please wait a few minutes before trying again.',
        )
      }
    })

    it('handles object with message string property', () => {
      const errWithMsg = { message: 'Object error message' }
      try {
        handleApiError('test/route', errWithMsg)
        fail('Should have thrown')
      } catch (err: any) {
        expect(err.status).toBe(400)
        expect(err.body.message).toBe('Object error message')
      }
    })

    it('handles unknown error types with fallback message', () => {
      try {
        handleApiError('test/route', 12345)
        fail('Should have thrown')
      } catch (err: any) {
        expect(err.status).toBe(400)
        expect(err.body.message).toBe('Something went wrong. Please try again.')
      }
    })
  })
})
