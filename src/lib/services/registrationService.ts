import { db } from '$lib/client/firebase'
import {
  maxChildrenPerAccount,
  registrationsCollection,
  withSemester,
} from '$lib/data/collections'
import { buildRegistrationApiPayload } from '$lib/helpers/registrationForm'
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'

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
   * Saves a registration document to Firestore.
   */
  async saveRegistration(
    studentUid: string,
    registrationData: Data.Registration,
  ): Promise<void> {
    const docRef = doc(db, registrationsCollection, studentUid)
    await setDoc(docRef, withSemester(registrationData))
  },

  /**
   * Fetches all `maxChildrenPerAccount` possible child registration slots
   * (`{parentUid}-1`, `{parentUid}-2`, ...) for a parent account in parallel.
   * Each slot reports whether a document exists at that uid and its data if so -
   * callers decide whether to stop at the first gap or filter by submission status.
   */
  async fetchChildRegistrationSlots(
    parentUid: string,
  ): Promise<ChildRegistrationSlot[]> {
    const slotUids = Array.from(
      { length: maxChildrenPerAccount },
      (_, i) => `${parentUid}-${i + 1}`,
    )
    const snaps = await Promise.all(
      slotUids.map((uid) => getDoc(doc(db, registrationsCollection, uid))),
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
