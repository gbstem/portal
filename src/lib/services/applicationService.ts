import { db } from '$lib/client/firebase'
import { applicationsCollection, withSemester } from '$lib/data/collections'
import { buildApplyApiPayload } from '$lib/helpers/applyForm'
import { doc, getDoc, setDoc } from 'firebase/firestore'

/**
 * Service providing Data Access Layer for instructor applications.
 */
export const applicationService = {
  /**
   * Fetches an application document for a given user UID.
   */
  async fetchUserApplication(
    userUid: string,
  ): Promise<Data.Application | null> {
    const docRef = doc(db, applicationsCollection, userUid)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      return snap.data() as Data.Application
    }
    return null
  },

  /**
   * Saves an application document to Firestore.
   */
  async saveUserApplication(
    userUid: string,
    applicationData: Data.Application,
  ): Promise<void> {
    const docRef = doc(db, applicationsCollection, userUid)
    await setDoc(docRef, withSemester(applicationData))
  },

  /**
   * Sends the application notification payload to the API endpoint.
   */
  async submitApplicationApi(firstName: string): Promise<void> {
    const payload = buildApplyApiPayload(firstName)
    const response = await fetch('/api/application', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error('Failed to submit application via API')
    }
  },
}
