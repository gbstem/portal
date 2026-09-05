import { adminAuth } from '$lib/server/firebase'

/**
 * Resolves the interviewer's current email from Auth by uid.
 *
 * `fallbackEmail` is the address stored on the slot document. It only exists
 * until Phase 4 deletes it, and every use is logged as
 * `[legacy-email-fallback]` so the counter can be watched to zero first - see
 * notes/EMAIL_TO_UID_AUDIT.md sections 7 and 8.
 *
 * The fallback covers two different failures and both are tagged. A *missing*
 * uid means an old client sent none at all. An *unresolvable* one means a uid
 * was sent but names no Auth account - an interviewer whose account was
 * deleted, or a uid recovered by parsing a document id that turned out not to
 * be a real account. Phase 4 turns the first into a validation error and the
 * second into a hard failure, so both have to read zero before it ships.
 *
 * Returns undefined when neither source yields an address, leaving the caller
 * to decide the status code.
 */
export async function resolveCurrentInterviewerEmail(
  interviewerUid: string | undefined,
  fallbackEmail?: string,
  route = 'unknown',
): Promise<string | undefined> {
  if (!interviewerUid) {
    if (fallbackEmail) {
      console.warn(
        `[legacy-email-fallback] ${route}: no interviewerUid in payload, ` +
          `using the stored interviewer email`,
      )
    }
    return fallbackEmail
  }
  try {
    const user = await adminAuth.getUser(interviewerUid)
    if (user.email) return user.email
    console.warn(
      `[legacy-email-fallback] ${route}: interviewerUid ${interviewerUid} has ` +
        `no email on its Auth account; using the stored interviewer email`,
    )
    return fallbackEmail
  } catch (err) {
    console.warn(
      `[legacy-email-fallback] ${route}: interviewerUid ${interviewerUid} ` +
        `resolved to no Auth account; using the stored interviewer email`,
      err,
    )
    return fallbackEmail
  }
}
