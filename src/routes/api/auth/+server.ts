import { adminAuth } from '$lib/server/firebase'
import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { idToken } = await request.json()
  const expiresIn = 1000 * 60 * 60 * 24 * 7
  const decodedIdToken = await adminAuth.verifyIdToken(idToken)

  // Validate that the user role is appropriate for this site.
  //
  // The claim is the only thing consulted. This used to fall back to reading
  // a `role` field in `users/{uid}` when the claim was missing, and then
  // minted a claim from it - but that document is one its own owner could
  // write, so the claim the entire system authorizes against was ultimately
  // chosen by the client. That field no longer exists. Roles are set
  // server-side at signup (/api/signup) and by admin, both through the Admin
  // SDK, and every older account was backfilled with a claim; an account with
  // no claim now is one that never finished signing up, and signing up again
  // is the repair.
  const userRecord = await adminAuth.getUser(decodedIdToken.uid)
  const role = userRecord.customClaims?.role

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
    // cookies.set()'s option is maxAge (seconds), not expiresIn (ms, the
    // Firebase Admin SDK option used above for the session cookie itself) -
    // the mismatched key was silently dropped, so the browser treated this
    // as a session cookie and the intended 7-day persistence never applied.
    const options = {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: true,
      path: '/',
    }
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
