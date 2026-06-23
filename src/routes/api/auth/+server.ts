import { adminAuth, adminDb } from '$lib/server/firebase'
import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { idToken } = await request.json()
  const expiresIn = 1000 * 60 * 60 * 24 * 7
  const decodedIdToken = await adminAuth.verifyIdToken(idToken)

  // Validate that the user role is appropriate for this site
  const userRecord = await adminAuth.getUser(decodedIdToken.uid)
  let role = userRecord.customClaims?.role
  if (!role) {
    const userDoc = await adminDb
      .collection('users')
      .doc(decodedIdToken.uid)
      .get()
    if (userDoc.exists) {
      role = userDoc.data()?.role
    }
  }

  const allowedRoles = ['student', 'instructor']
  if (!role || !allowedRoles.includes(role)) {
    const roleName = role
      ? role.charAt(0).toUpperCase() + role.slice(1)
      : 'User'
    throw error(403, `${roleName}s must sign in on the admin site.`)
  }

  if (new Date().getTime() / 1000 - decodedIdToken.auth_time < 5 * 60) {
    const cookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn,
    })
    const options = { expiresIn, httpOnly: true, secure: true, path: '/' }
    cookies.set('__session', cookie, options)
    return json({ status: 'signedIn' })
  } else {
    throw error(401, 'Recent sign in required.')
  }
}

export const DELETE: RequestHandler = async ({ cookies }) => {
  cookies.delete('__session', { path: '/' })
  return json({ status: 'signedOut' })
}
