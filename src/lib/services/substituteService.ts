import { errorMessage } from '#lib/shared/apiErrors.js'
import { db } from '#lib/client/firebase.js'
import { SubRequestStatus } from '#lib/components/helpers/SubRequestStatus.js'
import { substituteRequestsCollection } from '#lib/data/collections.js'
import { accountEmailService } from '#lib/services/accountEmailService.js'
import { type SubClassesDataResult } from '#lib/helpers/subClasses.js'
import {
  collection,
  getDocs,
  query,
  where,
  type QuerySnapshot,
} from 'firebase/firestore'
import type {
  CancelSubRequestBody,
  EditSubRequestBody,
} from '../../routes/api/subRequest/+server'
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
  SubstituteSessionLinkResponse,
  SubstituteSessionRequestBody,
  SubstituteSessionResponse,
} from '../../routes/api/substituteSession/+server'

async function sendSubRequest(
  method: 'PATCH' | 'DELETE',
  payload: EditSubRequestBody | CancelSubRequestBody,
): Promise<void> {
  const res = await fetch('/api/subRequest', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(await errorMessage(res, 'Could not save that sub request.'))
  }
}

/** The collection id every semester's sub requests share. */

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
   * The current addresses of the instructors of record for the sessions this
   * user is covering, keyed by sub request id. A session whose instructor's
   * account is gone is simply absent, and the view drops the address rather
   * than showing a stale one - no address is stored on the request.
   */
  fetchCoveredInstructorEmails(
    subRequests: Data.SubRequest[],
  ): Promise<Record<string, string>> {
    return accountEmailService.resolveEmailsByDocument(
      subRequests.map((subRequest) => ({
        id: subRequest.id,
        uid: subRequest.originalInstructorUid ?? '',
      })),
      ({ ids, uids }) => ({
        intent: 'coveredSubRequestInstructor',
        uids,
        context: { subRequestIds: ids },
      }),
    )
  },

  /**
   * Saves edits to one of the signed-in instructor's sub requests: its
   * session and notes. Its date follows the session, server-side. Changing the session moves the request, in one
   * transaction server-side - see /api/subRequest. Throws with the server's
   * message on refusal.
   */
  async saveSubRequest(subRequest: Data.SubRequest): Promise<void> {
    const payload: EditSubRequestBody = {
      // The document id as read, which names the session it is moving from.
      subRequestId: subRequest.id,
      classNumber: subRequest.classNumber,
      notes: subRequest.notes,
    }
    await sendSubRequest('PATCH', payload)
  },

  /**
   * Cancels one of the signed-in instructor's sub requests - see
   * /api/subRequest. Throws with the server's message on refusal, including
   * when the request is already gone.
   */
  async deleteSubRequest(subRequestId: string): Promise<void> {
    const payload: CancelSubRequestBody = { subRequestId }
    await sendSubRequest('DELETE', payload)
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
   * The meeting link of a session this substitute signed up to cover. Read
   * server-side, which checks they are its substitute: class documents aren't
   * readable from the browser. See /api/substituteSession.
   */
  async fetchSubstituteMeetingLink(subRequestId: string): Promise<string> {
    const params = new URLSearchParams({ subRequestId })
    const res = await fetch(`/api/substituteSession?${params.toString()}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        body?.message || 'Could not load that class. Please reload.',
      )
    }
    return (body as SubstituteSessionLinkResponse).meetingLink
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
