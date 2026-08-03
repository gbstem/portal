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
    throw redirect(301, 'https://admin.gbstem.org')
  }
  return resolve(event)
}) satisfies Handle

export const handleError = (({ error }) => {
  const is404 =
    (error as any)?.status === 404 ||
    (error as any)?.message?.includes('Not found')

  if (!is404) {
    console.error('[SvelteKit Server Error]:', error)
  }

  return {
    message: (error as any)?.message || 'An unexpected error occurred.',
    code: (error as any)?.code || 'INTERNAL_ERROR',
    details: (error as any)?.stack || String(error),
  }
}) satisfies HandleServerError
