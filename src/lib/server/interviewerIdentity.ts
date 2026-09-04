import { adminAuth } from '$lib/server/firebase'

/**
 * Resolves the interviewer's current email from Auth by uid, falling back to
 * the stored email if the account was deleted or uid is missing. Stored email
 * is unreliable because the interviewer could change their email later, so code
 * should avoid using it directly; we retain it only as a permanent record of the
 * interviewer, though fallback is rare.
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
