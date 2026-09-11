import { db } from '$lib/client/firebase'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import { substituteRequestsCollection } from '$lib/data/collections'
import {
  subRequestClassId,
  subRequestDocId,
  type SubClassesDataResult,
} from '$lib/helpers/subClasses'
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  query,
  where,
  writeBatch,
  type QuerySnapshot,
} from 'firebase/firestore'
import type {
  OpenSubRequestsResponse,
  SubstituteClaimResponse,
  SubstituteRequestBody,
} from '../../routes/api/substitute/+server'
import type {
  SubstituteFeedbackRequestBody,
  SubstituteFeedbackResponse,
} from '../../routes/api/substituteFeedback/+server'
import type {
  SubstituteSessionRequestBody,
  SubstituteSessionResponse,
} from '../../routes/api/substituteSession/+server'

/** Requests from one or more queries, each once, carrying its document id. */
function toSubRequests(...snapshots: QuerySnapshot[]): Data.SubRequest[] {
  const byId = new Map<string, Data.SubRequest>()
  for (const snapshot of snapshots) {
    for (const docSnap of snapshot.docs) {
      byId.set(docSnap.id, {
        ...(docSnap.data() as Data.SubRequest),
        id: docSnap.id,
      })
    }
  }
  return [...byId.values()]
}

/**
 * Service providing Data Access Layer for substitute requests and class substitution.
 */
export const substituteService = {
  /**
   * Loads the three lists the substitute dashboard shows.
   *
   * The caller's own requests - filed by them, or for a class they are the
   * instructor of record on - and the sessions they are covering are read
   * directly, by the uid fields firestore.rules checks. The sessions they
   * could sign up for belong to other instructors, so /api/substitute
   * finds those.
   */
  async fetchUserSubRequests(userId: string): Promise<SubClassesDataResult> {
    const subRequests = collection(db, substituteRequestsCollection)
    const [requestedByUser, forUsersClasses, coveredByUser, openRes] =
      await Promise.all([
        getDocs(query(subRequests, where('requestedByUid', '==', userId))),
        getDocs(
          query(subRequests, where('originalInstructorUid', '==', userId)),
        ),
        getDocs(
          query(
            subRequests,
            where('subInstructorId', '==', userId),
            where('subRequestStatus', 'in', [
              SubRequestStatus.SubstituteFound,
              SubRequestStatus.SubstituteFeedbackNeeded,
            ]),
          ),
        ),
        fetch('/api/substitute'),
      ])

    if (!openRes.ok) {
      throw new Error(
        `Failed to load classes needing a substitute (${openRes.status})`,
      )
    }
    const { subRequests: open } =
      (await openRes.json()) as OpenSubRequestsResponse

    return {
      userSubRequests: toSubRequests(requestedByUser, forUsersClasses),
      userSubClasses: toSubRequests(coveredByUser),
      classesMissingSubs: open.map((openRequest) => ({
        ...openRequest,
        dateOfClass: new Date(openRequest.dateOfClass),
      })),
    }
  },

  /**
   * Counts substitute requests this user fully completed (including feedback)
   * as the substitute instructor - used for community service hour tallies.
   */
  async countCompletedSubClasses(userId: string): Promise<number> {
    const snapshot = await getCountFromServer(
      query(
        collection(db, substituteRequestsCollection),
        where('subInstructorId', '==', userId),
        where('subRequestStatus', '==', SubRequestStatus.NoSubstituteNeeded),
      ),
    )
    return snapshot.data().count
  },

  /**
   * Creates or updates a substitute request doc.
   */
  async saveSubRequest(
    subRequest: Data.SubRequest,
    originalClassNumber?: number,
  ): Promise<void> {
    // Keyed by the class, never by whoever is signed in: an edit has to land
    // on the document the request was created at, and a co-instructor editing
    // a request is not the uid in that class's id anyway.
    const classId = subRequestClassId(subRequest.id)
    if (!classId) {
      throw new Error(
        `Cannot save a sub request without a class: id was "${subRequest.id}"`,
      )
    }

    const docRef = doc(
      db,
      substituteRequestsCollection,
      subRequestDocId(classId, subRequest.classNumber),
    )
    // `id` is stored as the class id at creation (see buildSubRequestPayload)
    // while the in-memory copy carries the document id, so it is restamped
    // rather than written back as read.
    const batch = writeBatch(db)
    batch.set(docRef, { ...subRequest, id: classId })

    // Moving a request to another session moves the document, so the one it
    // came from has to go - in the same batch. As two writes, a failed delete
    // left the request at both sessions, and a refused write (the new
    // session already has a request) still deleted the old one.
    if (
      originalClassNumber !== undefined &&
      subRequest.classNumber !== originalClassNumber
    ) {
      batch.delete(
        doc(
          db,
          substituteRequestsCollection,
          subRequestDocId(classId, originalClassNumber),
        ),
      )
    }
    await batch.commit()
  },

  /**
   * Deletes a substitute request doc.
   */
  async deleteSubRequest(subRequestId: string): Promise<void> {
    // The document id as read, rather than one rebuilt from the signed-in
    // user - deleting a document that does not exist succeeds silently, so
    // getting this wrong reported success and left the request standing.
    const docRef = doc(db, substituteRequestsCollection, subRequestId)
    await deleteDoc(docRef)
  },

  /**
   * Signs the signed-in user up to substitute one session. The claim and its
   * confirmation email both happen server-side - see /api/substitute.
   * Returns the request as claimed; throws with the server's message when it
   * gives one (somebody else signed up first, say).
   */
  async claimSubstituteSlot(subRequestId: string): Promise<Data.SubRequest> {
    const payload: SubstituteRequestBody = { subRequestId }
    const res = await fetch('/api/substitute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        body?.message || 'Error signing up to substitute, please try again.',
      )
    }
    const { subRequest } = body as SubstituteClaimResponse
    return { ...subRequest, dateOfClass: new Date(subRequest.dateOfClass) }
  },

  /**
   * Records that this substitute is holding the class they signed up for, and
   * returns the meeting link to send them to.
   *
   * Server-side, unlike every other write in this service: marking the session
   * held updates the *class* document, which firestore.rules opens only to the
   * class's own instructors. See /api/substituteSession.
   */
  async recordSubstituteSession(
    subRequestId: string,
  ): Promise<SubstituteSessionResponse> {
    const payload: SubstituteSessionRequestBody = { subRequestId }
    const res = await fetch('/api/substituteSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    if (!res.ok) {
      throw new Error(
        body?.message || 'Could not start that class. Please try again.',
      )
    }
    return body as SubstituteSessionResponse
  },

  /**
   * Files a substitute's feedback for the class they covered, which also
   * marks the session complete and closes the request out. Server-side for
   * the same reason as `recordSubstituteSession`.
   */
  async submitSubstituteFeedback(
    payload: SubstituteFeedbackRequestBody,
  ): Promise<SubstituteFeedbackResponse> {
    const res = await fetch('/api/substituteFeedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    if (!res.ok) {
      throw new Error(
        body?.message || 'Could not save that feedback. Please try again.',
      )
    }
    return body as SubstituteFeedbackResponse
  },
}
