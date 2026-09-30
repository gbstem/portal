import { adminDb } from '$lib/server/firebase'

/**
 * The names on `users/{uid}`, `''` where missing. Forms that show or stamp the
 * signed-in person's name read it here, server-side, rather than trusting
 * whatever the browser sends.
 */
export async function profileNames(
  uid: string,
): Promise<{ firstName: string; lastName: string }> {
  const profile = (await adminDb.doc(`users/${uid}`).get()).data() ?? {}
  return {
    firstName: String(profile.firstName ?? ''),
    lastName: String(profile.lastName ?? ''),
  }
}
