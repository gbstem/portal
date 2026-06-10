import { error, isHttpError } from '@sveltejs/kit'
import { ZodError } from 'zod'

/**
 * Ensures the user is signed in (authenticated).
 * Throws a 401 if not signed in.
 */
export function verifyAuthenticated(locals: App.Locals) {
  if (!locals.user) {
    throw error(401, 'User not signed in.')
  }
  return locals.user
}

/**
 * Translates caught exceptions into SvelteKit HttpErrors.
 * If the exception is already a SvelteKit error, it is rethrown as-is.
 */
export function handleApiError(err: unknown): never {
  if (isHttpError(err)) {
    throw err
  }

  if (err instanceof ZodError) {
    const formattedErrors = err.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ')
    throw error(400, `Validation failed: ${formattedErrors}`)
  }

  if (typeof err === 'string') {
    throw error(400, err)
  }

  if (err instanceof Error) {
    throw error(400, err.message)
  }

  const typedErr = err as any
  if (typedErr && typeof typedErr === 'object') {
    if (
      'errorInfo' in typedErr &&
      typedErr.errorInfo &&
      'message' in typedErr.errorInfo
    ) {
      throw error(
        400,
        typedErr.errorInfo.message ||
          'Please wait a few minutes before trying again.',
      )
    }
    if ('message' in typedErr && typeof typedErr.message === 'string') {
      throw error(400, typedErr.message)
    }
  }

  throw error(400, 'Something went wrong. Please try again.')
}
