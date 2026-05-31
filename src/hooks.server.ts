import { adminAuth } from '$lib/server/firebase'
import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit'

export const handle = (async ({ event, resolve }) => {
  const sessionCookie = event.cookies.get('__session')
  let topRedirect
  try {
    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie!,
      true,
    )
    const userRecord = await adminAuth.getUser(decodedClaims.uid)
    if (userRecord.customClaims && 'role' in userRecord.customClaims) {
      const { role } = userRecord.customClaims as { role: Data.Role }
      if (role === 'student' || role === 'instructor') {
        event.locals.user = {
          uid: userRecord.uid,
          email: userRecord.email as string,
          emailVerified: userRecord.emailVerified,
          role,
        }
      } else {
        event.locals.user = null
        topRedirect = redirect(301, 'https://admin.gbstem.org')
      }
    } else {
      await adminAuth.setCustomUserClaims(userRecord.uid, { role: 'student' })
    }
  } catch (err) {
    event.locals.user = null
  }
  if (topRedirect !== undefined) {
    throw topRedirect
  }
  return resolve(event)
}) satisfies Handle

export const handleError = (({ error }) => {
  console.error('[SvelteKit Server Error]:', error)
  return {
    message: (error as any)?.message || 'An unexpected error occurred.',
    code: (error as any)?.code || 'INTERNAL_ERROR',
    details: (error as any)?.stack || String(error),
  }
}) satisfies HandleServerError
