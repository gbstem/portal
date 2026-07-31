import { db } from '$lib/client/firebase'
import {
  applicationsCollection,
  decisionsCollection,
  withSemester,
} from '$lib/data/collections'
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
   * Fetches the decision document's `type` for a given user UID, or null if
   * no decision has been recorded yet.
   */
  async fetchDecisionType(userUid: string): Promise<Data.Decision | null> {
    const docRef = doc(db, decisionsCollection, userUid)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      return snap.data().type as Data.Decision
    }
    return null
  },

  /**
   * Fetches an instructor's combined application/decision status for dashboard display:
   * null if no application exists, 'submitted' if submitted with no decision yet,
   * or the decision type once one has been recorded.
   */
  async fetchApplicationDashboardStatus(
    userUid: string,
  ): Promise<Data.Decision | 'submitted' | null> {
    const [application, decision] = await Promise.all([
      this.fetchUserApplication(userUid),
      this.fetchDecisionType(userUid),
    ])

    if (!application?.meta.submitted) {
      return null
    }
    return decision ?? 'submitted'
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
