import { redirect } from '@sveltejs/kit'
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks'
import { adminAuth } from '#lib/server/firebase.js'

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
    throw redirect(303, 'https://admin.gbstem.org', { external: true })
  }
  return resolve(event)
}) satisfies Handle

/**
 * Shapes an *unexpected* error - anything not thrown with `error()` - for the
 * client. Returning only an id leaves SvelteKit's own status and message
 * ("Internal Error") in place, so nothing about the error itself goes back;
 * it is logged here under that id for a user to quote when reporting it.
 * Never return the stack or the raw message: unauthenticated callers reach
 * this (a malformed POST to /api/auth is enough), and those exposed server
 * paths, bundle layout and dependency details.
 *
 * Errors thrown with `error()` (kind `app`) and SvelteKit's own, such as a
 * 404 (kind `framework`), already carry a message meant for the client, so
 * they pass through unchanged and unlogged.
 */
export const handleError = (({ kind, error }) => {
  if (kind !== 'unknown') return
  const errorId = crypto.randomUUID()
  console.error(`[SvelteKit Server Error ${errorId}]:`, error)
  return { errorId }
}) satisfies HandleServerError
