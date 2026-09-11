import {
  applicationsCollection,
  classesCollection,
  decisionsCollection,
  maxChildrenPerAccount,
  registrationsCollection,
  substituteRequestsCollection,
} from '$lib/data/collections'
import {
  planInstructorAccountDeletion,
  planStudentAccountDeletion,
  type RegistrationForDeletion,
} from '$lib/helpers/accountDeletion'
import { adminAuth, adminDb } from '$lib/server/firebase'
import { INSTRUCTOR_CLASSES_COLLECTION } from '$lib/server/instructorClasses'
import { error } from '@sveltejs/kit'
import type {
  DocumentReference,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore'

export interface AccountDeletionEligibility {
  canDelete: boolean
  reason: string | null
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  return new Date(value as string)
}

function hasFutureSubRequest(docs: QueryDocumentSnapshot[]): boolean {
  const now = new Date()
  return docs.some((doc) => toDate(doc.data().dateOfClass) > now)
}

function toRegistrationForDeletion(
  doc: DocumentSnapshot,
): RegistrationForDeletion {
  const data = doc.data() as Data.Registration
  return { id: doc.id, enrolled: data.enrolled, classes: data.classes }
}

/** Every possible child registration ref for a parent account. */
function registrationRefs(uid: string): DocumentReference[] {
  return Array.from({ length: maxChildrenPerAccount }, (_, i) =>
    adminDb.doc(`${registrationsCollection}/${uid}-${i + 1}`),
  )
}

/**
 * Reads what `planInstructorAccountDeletion` needs, either as plain reads
 * (the pre-flight check) or through a transaction (the delete, so the
 * re-check and the writes that follow see the same snapshot).
 */
async function instructorEligibility(
  uid: string,
  transaction?: Transaction,
): Promise<AccountDeletionEligibility> {
  const ownedQuery = adminDb
    .collection(classesCollection)
    .where('instructorUid', '==', uid)
    .limit(1)
  const coInstructedQuery = adminDb
    .collection(classesCollection)
    .where('otherInstructorUids', 'array-contains', uid)
    .limit(1)
  const subRequestsQuery = adminDb
    .collection(substituteRequestsCollection)
    .where('subInstructorId', '==', uid)

  const [ownedSnap, coInstructedSnap, subRequestsSnap] = await Promise.all([
    transaction ? transaction.get(ownedQuery) : ownedQuery.get(),
    transaction ? transaction.get(coInstructedQuery) : coInstructedQuery.get(),
    transaction ? transaction.get(subRequestsQuery) : subRequestsQuery.get(),
  ])

  return planInstructorAccountDeletion(
    !ownedSnap.empty,
    !coInstructedSnap.empty,
    hasFutureSubRequest(subRequestsSnap.docs),
  )
}

/**
 * Reads what `planStudentAccountDeletion` needs: every child registration
 * that actually exists.
 */
async function studentEligibility(
  uid: string,
  transaction?: Transaction,
): Promise<{
  eligibility: AccountDeletionEligibility
  existingRegistrationRefs: DocumentReference[]
}> {
  const refs = registrationRefs(uid)
  const snaps = transaction
    ? await transaction.getAll(...refs)
    : await Promise.all(refs.map((ref) => ref.get()))

  const existing = snaps.filter((snap) => snap.exists)
  return {
    eligibility: planStudentAccountDeletion(
      existing.map((snap) => toRegistrationForDeletion(snap)),
    ),
    existingRegistrationRefs: existing.map((snap) => snap.ref),
  }
}

/**
 * Whether `uid` could delete their own account right now - see
 * `planInstructorAccountDeletion`/`planStudentAccountDeletion` for the
 * rules. A plain read, for the pre-flight check; `deleteAccount` re-checks
 * the same rule from inside its transaction rather than trusting this
 * result, since time can pass between the two.
 */
export async function checkAccountDeletionEligibility(
  uid: string,
  role: 'student' | 'instructor',
): Promise<AccountDeletionEligibility> {
  if (role === 'instructor') {
    return instructorEligibility(uid)
  }
  return (await studentEligibility(uid)).eligibility
}

/**
 * Deletes a portal account: re-checks eligibility inside a transaction
 * (re-reading the same data, never trusting an earlier check), and if it
 * still passes, deletes that role's data plus the shared `users` document.
 * Only after the transaction commits does it delete the Auth account -
 * Firestore data first, Auth account last, so a failure here never leaves a
 * live account with no way to retry, and a retry is a no-op over data
 * that's already gone.
 *
 * Instructor: `applications/{uid}`, `decisions/{uid}` (the Admin SDK bypasses
 * the admin/reviewer-only write rule) and `instructorClasses/{uid}`, each
 * only if it exists.
 *
 * Student: every existing child registration, plus `confirmations/{uid}` -
 * one per parent account, part of the registration, not a historical
 * record. In practice this is defensive: the only code that ever wrote a
 * `confirmations` doc (a retreat-attendance form) was removed from this
 * repo in 2025 without also removing the collection, its firestore.rules
 * entry, or admin's read of it, so no account created since can have one -
 * deleting it here costs nothing and covers the account-history exception
 * (the demo seed data, and any doc created directly in Firestore).
 * `checkIns` is deliberately never touched: it only exists for a student
 * enrolled in a class this semester, which is exactly what already blocks
 * deletion, so a deletion that actually proceeds can't have one to clean up.
 *
 * Throws a 409 (via `error()`) with the block reason if the account can't
 * be deleted.
 */
export async function deleteAccount(
  uid: string,
  role: 'student' | 'instructor',
): Promise<void> {
  const usersRef = adminDb.doc(`users/${uid}`)

  await adminDb.runTransaction(async (transaction) => {
    if (role === 'instructor') {
      const eligibility = await instructorEligibility(uid, transaction)
      if (!eligibility.canDelete) {
        throw error(409, eligibility.reason as string)
      }
      const applicationRef = adminDb.doc(`${applicationsCollection}/${uid}`)
      const decisionRef = adminDb.doc(`${decisionsCollection}/${uid}`)
      const instructorClassesRef = adminDb.doc(
        `${INSTRUCTOR_CLASSES_COLLECTION}/${uid}`,
      )
      const [applicationSnap, decisionSnap, instructorClassesSnap] =
        await transaction.getAll(
          applicationRef,
          decisionRef,
          instructorClassesRef,
        )
      if (applicationSnap.exists) transaction.delete(applicationRef)
      if (decisionSnap.exists) transaction.delete(decisionRef)
      if (instructorClassesSnap.exists) {
        transaction.delete(instructorClassesRef)
      }
    } else {
      const { eligibility, existingRegistrationRefs } =
        await studentEligibility(uid, transaction)
      if (!eligibility.canDelete) {
        throw error(409, eligibility.reason as string)
      }
      // Read before any write in this transaction - Firestore refuses a
      // read after a write has already been queued.
      const confirmationRef = adminDb.doc(`confirmations/${uid}`)
      const confirmationSnap = await transaction.get(confirmationRef)

      for (const ref of existingRegistrationRefs) {
        transaction.delete(ref)
      }
      if (confirmationSnap.exists) {
        transaction.delete(confirmationRef)
      }
    }
    transaction.delete(usersRef)
  })

  await adminAuth.deleteUser(uid)
}
