import { db } from '$lib/client/firebase'
import {
  applicationsCollection,
  decisionsCollection,
} from '$lib/data/collections'
import { retryTransient } from '$lib/services/retry'
import { doc, getDoc } from 'firebase/firestore'

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
    // Retried on transport blips: the dashboard's application status is read
    // through here.
    const snap = await retryTransient(() => getDoc(docRef), {
      label: `application ${userUid}`,
    })
    if (snap.exists()) {
      return snap.data() as Data.Application
    }
    return null
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
}
