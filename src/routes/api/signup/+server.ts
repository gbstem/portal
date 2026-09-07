import { handleApiError } from '$lib/server/apiHelpers'
import { adminAuth, adminDb } from '$lib/server/firebase'
import { error, json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const signupSchema = z.object({
  idToken: z.string().min(1, 'ID Token is required'),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  // What the person said they were signing up to do. Note this is *not* the
  // role - `roleForSignup` decides that, on the server.
  accountType: z.enum(['instructor', 'student']),
})

export type SignupRequestBody = z.infer<typeof signupSchema>

/**
 * The role a new account gets, given what the signup form was told.
 *
 * The single place role assignment is decided, which is the point of this
 * route existing. It used to happen in the browser: `userService.createUser`
 * wrote `users/{uid}` with a role of its choosing and portal's `/api/auth`
 * then minted a custom claim from that document, so the claim the whole system
 * authorizes against was ultimately a value the client picked.
 *
 * The mapping is deliberately still an identity function. Closing the
 * *escalation* (writing any role, at any time) and changing the *policy*
 * (whether choosing "instructor" should grant the instructor role at all) are
 * separate changes with very different blast radii, and only the first is safe
 * to ship in the middle of an application cycle. An account that picks
 * instructor here has exactly the access it had before.
 *
 * TODO(phase-2): return 'instructor-applicant' here, and let admin's
 * /api/decision promote to 'instructor' or 'instructor-substitute' when
 * someone is actually accepted. That is the whole policy change - everything
 * else about this route stays as it is.
 */
function roleForSignup(accountType: 'instructor' | 'student'): Data.Role {
  return accountType
}

/**
 * Creates the `users` profile document and the role custom claim for an
 * account that was just created in the browser.
 *
 * Authorization is the ID token: the caller can only ever act on the account
 * they hold a token for, and `verifyIdToken` is what proves that. There is no
 * `locals.user` to gate on because no session cookie exists yet - minting one
 * is `/api/auth`'s job, and it runs immediately after this.
 *
 * Refuses if the account already has a profile, so this cannot be used to
 * reassign a role after the fact. That is the whole attack it exists to
 * prevent, and it is a one-shot route by construction.
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = signupSchema.parse(await request.json())
    const { uid } = await adminAuth.verifyIdToken(body.idToken)

    const profileRef = adminDb.doc(`users/${uid}`)
    const existing = await profileRef.get()
    if (existing.exists) {
      throw error(409, 'This account has already been set up.')
    }

    const role = roleForSignup(body.accountType)
    await profileRef.set({
      role,
      firstName: body.firstName,
      lastName: body.lastName,
    })
    // Claims are merged onto whatever the account already carries rather than
    // replacing them, matching scripts/backfill-user-role-claims.ts.
    const existingClaims = (await adminAuth.getUser(uid)).customClaims ?? {}
    await adminAuth.setCustomUserClaims(uid, { ...existingClaims, role })

    // The caller must refresh its ID token before doing anything that
    // firestore.rules gates on the role - the token it holds was minted before
    // the claim existed. See SignUpForm.
    return json({ role })
  } catch (err) {
    throw handleApiError('/api/signup', err)
  }
}
