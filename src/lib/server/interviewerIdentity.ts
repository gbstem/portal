import { adminAuth } from '$lib/server/firebase'

/**
 * TEMPORARY (uid migration - see admin's setInterviewTimes.ts
 * `isOwnInterviewSlot` and interviews.cy.ts "Section H" in the admin repo):
 * interview slots are moving from identifying their interviewer by a frozen
 * `interviewerEmail` snapshot to a stable `interviewerUid`, since email goes
 * stale if the interviewer later changes their account's email. This
 * resolves the interviewer's *current* email (for the booking confirmation
 * email's cc/replyTo) by uid when one is on file, falling back to the
 * stored email for slots written before `interviewerUid` existed.
 *
 * TODO(interviewerUid migration, remove ~2026-10-03 once the current
 * interview cycle wraps and no live slot lacks an interviewerUid): delete
 * this function and have callers use the interviewer's email straight from
 * an `adminAuth.getUser(interviewerUid)` lookup, with no fallback. Mirror
 * the same removal in admin's copy of this file.
 */
export async function resolveCurrentInterviewerEmail(
  interviewerUid: string | undefined,
  fallbackEmail: string,
): Promise<string> {
  if (!interviewerUid) return fallbackEmail
  try {
    const user = await adminAuth.getUser(interviewerUid)
    return user.email ?? fallbackEmail
  } catch (err) {
    console.error(
      'Failed to resolve interviewer email by uid, falling back to the stored email:',
      err,
    )
    return fallbackEmail
  }
}
