import { decisionsCollection } from '$lib/data/collections'
import type { CoInstructor } from '$lib/helpers/classDetailsForm'
import { adminAuth, adminDb } from '$lib/server/firebase'
import type { UserRecord } from 'firebase-admin/auth'

const AUTH_LOOKUP_LIMIT = 100 // auth.getUsers() identifiers-per-call limit

// The shape this module resolves *to* is declared in the client-safe helper
// module, so components can name it without reaching into `$lib/server/*`.
export type { CoInstructor }

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Whether this account has been interviewed and accepted to teach this
 * semester. gbSTEM leadership's rule is that nobody teaches a class they
 * weren't assigned and accepted for, and the `decisions` document is the only
 * record of that - the `instructor` role claim is set at signup, long before
 * any interview, so it says nothing about acceptance on its own.
 *
 * Deliberately excludes the `substitute` decision: substitutes cover
 * individual sessions through the subRequests flow, which has its own
 * sign-up, and are not assigned to a class roster.
 */
export async function isAcceptedInstructor(uid: string): Promise<boolean> {
  try {
    const snap = await adminDb.doc(`${decisionsCollection}/${uid}`).get()
    return snap.exists && snap.data()?.type === 'accepted'
  } catch (err) {
    console.error(`Failed to read the decision for uid ${uid}:`, err)
    return false
  }
}

/**
 * Builds an identity from an Auth record. Names live in the `users` document
 * (see Data.User.Profile) rather than on the Auth record, and a client can't
 * read another user's `users` document under firestore.rules, which is why
 * this resolution is server-only.
 */
async function toIdentity(user: UserRecord): Promise<CoInstructor> {
  const [profileSnap, accepted] = await Promise.all([
    adminDb
      .doc(`users/${user.uid}`)
      .get()
      .catch(() => null),
    isAcceptedInstructor(user.uid),
  ])
  const profile = profileSnap?.data() ?? {}
  const [fallbackFirst = '', ...fallbackRest] = (user.displayName ?? '').split(
    ' ',
  )
  return {
    uid: user.uid,
    email: user.email ?? '',
    firstName: profile.firstName || fallbackFirst,
    lastName: profile.lastName || fallbackRest.join(' '),
    accepted,
  }
}

function isInstructorAccount(user: UserRecord): boolean {
  return user.customClaims?.role === 'instructor'
}

/**
 * The one message /api/lookupCoInstructor gives for every kind of failure -
 * no account, wrong role, no decision yet, or a decision that isn't
 * `accepted`. Telling the caller which would leak whether an address has a
 * gbSTEM account and how that person's application went.
 */
export const NOT_AN_ACCEPTED_INSTRUCTOR =
  'No accepted gbSTEM instructor has that email address. Check the spelling, ' +
  'or ask gbSTEM leadership to confirm they have been accepted.'

/**
 * Resolves one co-instructor email to their identity, or null if that address
 * doesn't belong to an accepted instructor.
 *
 * Callers must not report *why* a lookup failed. Distinguishing "no account"
 * from "not an instructor" from "not accepted" would turn this into a general
 * probe for whether an address has a gbSTEM account and how their application
 * went - someone else's admissions outcome, which is not the class owner's to
 * see. See admin's README "Firestore Schema" on why identifiers are uids.
 */
export async function lookupAcceptedInstructorByEmail(
  email: string,
): Promise<CoInstructor | null> {
  let user: UserRecord
  try {
    user = await adminAuth.getUserByEmail(email)
  } catch {
    // No account, or an address malformed enough that Auth rejects it
    // outright. Both are "not an accepted instructor" as far as callers go.
    return null
  }
  if (!isInstructorAccount(user)) return null
  const identity = await toIdentity(user)
  return identity.accepted ? identity : null
}

/**
 * Resolves stored `otherInstructorUids` to identities for display.
 *
 * A uid whose Auth account no longer exists is dropped: accounts get deleted,
 * and a class shouldn't carry a tombstone nobody can act on. Order follows
 * the uids passed in so the list doesn't reshuffle between loads. Note that
 * an *ineligible* account is still returned (with `accepted: false`) - only a
 * missing one disappears.
 */
export async function resolveCoInstructorIdentities(
  uids: string[],
): Promise<CoInstructor[]> {
  const uniqueUids = [...new Set(uids)]
  if (uniqueUids.length === 0) return []

  const found = new Map<string, UserRecord>()
  for (const batch of chunk(uniqueUids, AUTH_LOOKUP_LIMIT)) {
    const { users } = await adminAuth.getUsers(batch.map((uid) => ({ uid })))
    for (const user of users) {
      found.set(user.uid, user)
    }
  }

  const identities = await Promise.all(
    uniqueUids
      .map((uid) => found.get(uid))
      .filter((user): user is UserRecord => user !== undefined)
      .map(toIdentity),
  )
  return identities
}

/**
 * The single entry point for turning stored `otherInstructorUids` into
 * addresses to email. Every co-instructor send goes through here so the
 * addresses are always the accounts' *current* ones - the whole reason class
 * documents stopped storing emails - and so a deleted account drops out
 * instead of bouncing.
 */
export async function resolveCoInstructorEmails(
  uids: string[],
): Promise<string[]> {
  const identities = await resolveCoInstructorIdentities(uids)
  return identities.map((identity) => identity.email).filter(Boolean)
}
