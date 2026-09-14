import { adminAuth } from '$lib/server/firebase'

/**
 * Resolves the interviewer's current email from Auth by uid.
 *
 * There is deliberately no fallback to the address stored on the slot: it goes
 * stale the moment the interviewer changes their account email - see
 * notes/EMAIL_TO_UID_AUDIT.md section 7, Phase 4.
 *
 * Returns undefined, and logs why, for a slot with no uid or a uid naming no
 * Auth account. It does not throw, because the only caller runs after the slot
 * is booked and reports the confirmation as unsent instead.
 */
export async function resolveCurrentInterviewerEmail(
  interviewerUid: string | undefined,
  route: string,
): Promise<string | undefined> {
  if (!interviewerUid) {
    console.error(`[API ${route}] The slot has no interviewerUid`)
    return undefined
  }
  try {
    const user = await adminAuth.getUser(interviewerUid)
    if (user.email) return user.email
    console.error(
      `[API ${route}] interviewerUid ${interviewerUid} has no email on its Auth account`,
    )
  } catch (err) {
    console.error(
      `[API ${route}] interviewerUid ${interviewerUid} could not be resolved from Auth:`,
      err,
    )
  }
  return undefined
}
