import { db } from '$lib/client/firebase'
import { registrationsCollection, withSemester } from '$lib/data/collections'
import { buildRegistrationApiPayload } from '$lib/helpers/registrationForm'
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'

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
