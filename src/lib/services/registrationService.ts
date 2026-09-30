import { registrationDocId } from '$lib/data/docIds'
import { db } from '$lib/client/firebase'
import {
  maxChildrenPerAccount,
  registrationsCollection,
} from '$lib/data/collections'
import { retryTransient } from '$lib/services/retry'
import { doc, getDoc } from 'firebase/firestore'

export interface ChildRegistrationSlot {
  uid: string
  exists: boolean
  data: Data.Registration | null
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
    const slotUids = Array.from({ length: maxChildrenPerAccount }, (_, i) =>
      registrationDocId(parentUid, i + 1),
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
}
