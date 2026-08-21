import { db } from '$lib/client/firebase'
import {
  maxChildrenPerAccount,
  registrationsCollection,
  withSemester,
} from '$lib/data/collections'
import { buildRegistrationApiPayload } from '$lib/helpers/registrationForm'
import { retryTransient } from '$lib/services/retry'
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'

export interface ChildRegistrationSlot {
  uid: string
  exists: boolean
  data: Data.Registration | null
}

/**
 * A partial registration write. Every save after the first is a merge, so a group
 * omitted here - or a sub-field omitted from a group - keeps whatever the last
 * writer left there. That matters because admin writes to this same document:
 * it toggles `agreements.bypassAgeLimits` and edits the parent's own answers from
 * the admin review dialog.
 */
export type RegistrationUpdate = {
  [K in keyof Data.Registration]?: Partial<Data.Registration[K]>
}

/**
 * Service providing Data Access Layer for student registrations.
 */
export const registrationService = {
  /**
   * Fetches a student registration document from Firestore.
   */
  async fetchRegistration(
    studentUid: string,
  ): Promise<Data.Registration | null> {
    const docRef = doc(db, registrationsCollection, studentUid)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      return snap.data() as Data.Registration
    }
    return null
  },

  /**
   * Creates a student's registration document with the full default shape.
   *
   * Deliberately a whole-document write rather than a merge: nothing exists yet to
   * preserve, and admin's dashboard and registrations list query on
   * `meta.submitted == false`, so a draft missing that field would be invisible
   * there.
   */
  async createRegistration(
    studentUid: string,
    registrationData: Data.Registration,
  ): Promise<void> {
    const docRef = doc(db, registrationsCollection, studentUid)
    await setDoc(docRef, withSemester(registrationData))
  },

  /**
   * Merges the parent's edits into an existing registration document.
   *
   * A merge, not an overwrite, so fields the registration form doesn't own survive:
   * `agreements.bypassAgeLimits` is admin-only (it waives the course age check that
   * `classService` enforces), and the form's in-memory snapshot is up to one
   * autosave interval stale. Overwriting from that snapshot silently revoked a
   * waiver granted while the parent had the page open.
   */
  async updateRegistration(
    studentUid: string,
    changes: RegistrationUpdate,
  ): Promise<void> {
    const docRef = doc(db, registrationsCollection, studentUid)
    await setDoc(docRef, withSemester(changes), { merge: true })
  },

  /**
   * Fetches all `maxChildrenPerAccount` possible child registration slots
   * (`{parentUid}-1`, `{parentUid}-2`, ...) for a parent account in parallel.
   * Each slot reports whether a document exists at that uid and its data if so -
   * callers decide whether to stop at the first gap or filter by submission status.
   *
   * Slots are read independently and each retries transient failures on its own,
   * so one flaky read doesn't cost a re-read of the others - and doesn't reject
   * the caller, which is what used to leave pages stuck on a blank loading state.
   */
  async fetchChildRegistrationSlots(
    parentUid: string,
  ): Promise<ChildRegistrationSlot[]> {
    const slotUids = Array.from(
      { length: maxChildrenPerAccount },
      (_, i) => `${parentUid}-${i + 1}`,
    )
    const snaps = await Promise.all(
      slotUids.map((uid) =>
        retryTransient(() => getDoc(doc(db, registrationsCollection, uid)), {
          label: `registration slot ${uid}`,
        }),
      ),
    )
    return snaps.map((snap, i) => ({
      uid: slotUids[i],
      exists: snap.exists(),
      data: snap.exists() ? (snap.data() as Data.Registration) : null,
    }))
  },

  /**
   * Deletes a registration document from Firestore.
   */
  async deleteRegistration(studentUid: string): Promise<void> {
    const docRef = doc(db, registrationsCollection, studentUid)
    await deleteDoc(docRef)
  },

  /**
   * Submits registration notification to the backend API endpoint.
   */
  async submitRegistrationApi(
    userFirstName: string,
    studentFirstName: string,
    parentOrientationDate: string,
    secondaryEmail: string,
  ): Promise<void> {
    const payload = buildRegistrationApiPayload(
      userFirstName,
      studentFirstName,
      parentOrientationDate,
      secondaryEmail,
    )
    const res = await fetch('/api/registration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      throw new Error('Failed to submit registration via API')
    }
  },
}
