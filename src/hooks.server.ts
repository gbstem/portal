import { adminAuth } from '$lib/server/firebase'
import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit'

export const handle = (async ({ event, resolve }) => {
  const sessionCookie = event.cookies.get('__session')
  let shouldRedirectToAdmin = false
  try {
    if (sessionCookie) {
      const decodedClaims = await adminAuth.verifySessionCookie(
        sessionCookie,
        true,
      )
      // `/api/auth` is the only issuer of session cookies and it sets the role
      // claim before minting one, so a cookie without a claim means something
      // is wrong with the account rather than a claim that hasn't propagated.
      // Treat it as signed out; signing in again repairs it.
      const userRecord = await adminAuth.getUser(decodedClaims.uid)
      const { role } = (userRecord.customClaims ?? {}) as { role?: Data.Role }
      if (role === 'student' || role === 'instructor') {
        event.locals.user = {
          uid: userRecord.uid,
          email: userRecord.email as string,
          emailVerified: userRecord.emailVerified,
          role,
        }
      } else if (role) {
        event.locals.user = null
        shouldRedirectToAdmin = true
      } else {
        event.locals.user = null
      }
    } else {
      event.locals.user = null
    }
  } catch (err: any) {
    event.locals.user = null
  }
  // `redirect()` throws immediately, so it must be called outside the try
  // block above - otherwise the throw is caught by the surrounding
  // catch(err), which just resets locals.user and silently drops the
  // redirect instead of letting it propagate.
  if (shouldRedirectToAdmin) {
    throw redirect(303, 'https://admin.gbstem.org')
  }
  return resolve(event)
}) satisfies Handle

/**
 * Shapes an *unexpected* error - anything not thrown with `error()` - for the
 * client. Only SvelteKit's own `message` ("Internal Error", "Not Found") goes
 * back, plus an id to quote when reporting it; the error itself is logged
 * here under that id. This used to return the stack trace and the raw
 * message, to any caller at all (a malformed POST to /api/auth was enough),
 * which exposed server paths, bundle layout and dependency details.
 */
export const handleError = (({ error, status, message }) => {
  const errorId = crypto.randomUUID()
  if (status !== 404) {
    console.error(`[SvelteKit Server Error ${errorId}]:`, error)
  }
  return { message, errorId }
}) satisfies HandleServerError
