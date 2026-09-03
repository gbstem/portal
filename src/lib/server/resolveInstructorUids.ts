import { adminAuth } from '$lib/server/firebase'

const AUTH_LOOKUP_LIMIT = 100 // auth.getUsers() identifiers-per-call limit

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Resolves a list of co-instructor email addresses to their Firebase Auth
 * uids, for stamping `otherInstructorUids` on a class document (see
 * ClassDetailsForm.svelte). Only resolves emails belonging to an `instructor`
 * account - an email with no account, or a non-instructor account, is
 * silently omitted rather than erroring, since `otherInstructorEmails` is
 * free text the class owner types with no guarantee the address has an
 * account at all. Scoping to `instructor` role keeps this endpoint from
 * becoming a general "does this email have an account" probe.
 */
export async function resolveInstructorUids(
  emails: string[],
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {}
  const uniqueEmails = [...new Set(emails)]

  for (const batch of chunk(uniqueEmails, AUTH_LOOKUP_LIMIT)) {
    // `otherInstructorEmails` is free text a class owner types by hand, so a
    // malformed entry reaching here is expected, not exceptional - getUsers
    // throws on a malformed identifier and would otherwise take down the
    // whole batch over one typo, so fall back to resolving the batch one at
    // a time (each of which fails independently) rather than erroring out.
    let users: Awaited<ReturnType<typeof adminAuth.getUsers>>['users']
    try {
      users = (await adminAuth.getUsers(batch.map((email) => ({ email }))))
        .users
    } catch {
      users = (
        await Promise.all(
          batch.map((email) =>
            adminAuth.getUserByEmail(email).catch(() => null),
          ),
        )
      ).filter((user): user is NonNullable<typeof user> => user !== null)
    }
    for (const user of users) {
      if (user.email && user.customClaims?.role === 'instructor') {
        resolved[user.email] = user.uid
      }
    }
  }

  return resolved
}
