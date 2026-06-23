import { adminAuth, adminDb } from '$lib/server/firebase'
import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit'

export const handle = (async ({ event, resolve }) => {
  const sessionCookie = event.cookies.get('__session')
  let topRedirect
  try {
    if (sessionCookie) {
      const decodedClaims = await adminAuth.verifySessionCookie(
        sessionCookie,
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
        // Fallback for newly created users where custom claims haven't propagated yet.
        // Lookup the role from Firestore, set the claim, and populate event.locals.user
        // immediately so that the initial request (such as email verification) doesn't fail with a 401.
        const userDoc = await adminDb
          .collection('users')
          .doc(userRecord.uid)
          .get()
        let role: Data.Role = 'student'
        if (userDoc.exists) {
          const docData = userDoc.data()
          if (
            docData &&
            (docData.role === 'student' || docData.role === 'instructor')
          ) {
            role = docData.role
          }
        }
        await adminAuth.setCustomUserClaims(userRecord.uid, { role })
        event.locals.user = {
          uid: userRecord.uid,
          email: userRecord.email as string,
          emailVerified: userRecord.emailVerified,
          role,
        }
      }
    } else {
      event.locals.user = null
    }
  } catch (err: any) {
    event.locals.user = null
  }
  if (topRedirect !== undefined) {
    throw topRedirect
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
