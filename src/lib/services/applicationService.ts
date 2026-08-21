import { db } from '$lib/client/firebase'
import {
  applicationsCollection,
  decisionsCollection,
  withSemester,
} from '$lib/data/collections'
import { buildApplyApiPayload } from '$lib/helpers/applyForm'
import { retryTransient } from '$lib/services/retry'
import { doc, getDoc, setDoc } from 'firebase/firestore'

/**
 * A partial application write. Every save after the first is a merge, so a group
 * omitted here - or a sub-field omitted from a group - keeps whatever the last
 * writer left there. That matters because admin writes to this same document:
 * decision actions set `meta.decided`, and the admin review dialog edits the
 * applicant's own answers.
 */
export type ApplicationUpdate = {
  [K in keyof Data.Application]?: Partial<Data.Application[K]>
}

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
    // Retried on transport blips: ApplyForm creates the draft application from
    // this read's result, so a single dropped stream would otherwise mean the
    // instructor's application is silently never created.
    const snap = await retryTransient(() => getDoc(docRef), {
      label: `application ${userUid}`,
    })
    if (snap.exists()) {
      return snap.data() as Data.Application
    }
    return null
  },

  /**
   * Creates this user's application document with the full default shape.
   *
   * Deliberately a whole-document write rather than a merge: nothing exists yet to
   * preserve, and admin's dashboard and applications list query on
   * `meta.submitted == false` / `meta.decided == false`, so a draft missing those
   * fields would be invisible there.
   */
  async createUserApplication(
    userUid: string,
    applicationData: Data.Application,
  ): Promise<void> {
    const docRef = doc(db, applicationsCollection, userUid)
    await setDoc(docRef, withSemester(applicationData))
  },

  /**
   * Merges the applicant's edits into their existing application document.
   *
   * A merge, not an overwrite, so fields the apply form doesn't own survive:
   * `meta.decided` is set by admin decision actions, and the form's in-memory
   * snapshot is up to one autosave interval stale. Overwriting from that snapshot
   * silently reverted decisions made while the applicant had the page open.
   */
  async updateUserApplication(
    userUid: string,
    changes: ApplicationUpdate,
  ): Promise<void> {
    const docRef = doc(db, applicationsCollection, userUid)
    await setDoc(docRef, withSemester(changes), { merge: true })
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
