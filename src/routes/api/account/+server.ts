import {
  checkAccountDeletionEligibility,
  deleteAccount,
} from '$lib/server/accountService'
import { handleApiError, verifyAuthenticated } from '$lib/server/apiHelpers'
import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

/**
 * `hooks.server.ts` only ever admits a `student` or `instructor` session
 * (anyone else is redirected to admin.gbstem.org before reaching here) - this
 * just narrows `Data.Role` to match, for the DAL functions below.
 */
function accountRole(role: Data.Role): 'student' | 'instructor' {
  if (role !== 'student' && role !== 'instructor') {
    throw error(403, 'Unsupported account role.')
  }
  return role
}

/** Pre-flight check for the "Delete account" button - see DELETE below. */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const user = verifyAuthenticated(locals)
    const result = await checkAccountDeletionEligibility(
      user.uid,
      accountRole(user.role),
    )
    return json(result)
  } catch (err) {
    throw handleApiError('/api/account', err)
  }
}

/**
 * Deletes the caller's own account - their role's data plus the shared
 * `users` document and Auth account - see `deleteAccount`. Refused (409)
 * with a reason when deletion would leave a class or child mid-semester
 * without the person responsible for it; this re-checks the same rule the
 * GET above reports, rather than trusting that earlier result.
 */
export const DELETE: RequestHandler = async ({ locals }) => {
  try {
    const user = verifyAuthenticated(locals)
    await deleteAccount(user.uid, accountRole(user.role))
    return json({ deleted: true })
  } catch (err) {
    throw handleApiError('/api/account', err)
  }
}
