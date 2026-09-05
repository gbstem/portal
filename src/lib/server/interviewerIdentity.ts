import { adminAuth } from '$lib/server/firebase'

/**
 * Resolves the interviewer's current email from Auth by uid.
 *
 * `fallbackEmail` is the address a pre-UID browser build sends in the request
 * body. It only exists to keep those sessions working until they age out, and
 * every use of it is logged as `[legacy-email-fallback]` so the counter can be
 * watched to zero before the parameter is deleted outright - see
 * notes/EMAIL_TO_UID_AUDIT.md sections 7 and 8. Returns undefined when neither
 * source yields an address, leaving the caller to decide the status code.
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
          `using the client-supplied interviewer email`,
      )
    }
    return fallbackEmail
  }
  try {
    const user = await adminAuth.getUser(interviewerUid)
    if (user.email) return user.email
    console.warn(
      `[legacy-email-fallback] ${route}: interviewerUid ${interviewerUid} has ` +
        `no email on its Auth account`,
    )
    return fallbackEmail
  } catch (err) {
    console.error(
      'Failed to resolve interviewer email by uid, falling back to the stored email:',
      err,
    )
    return fallbackEmail
  }
}
