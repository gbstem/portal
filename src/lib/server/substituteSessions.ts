import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import {
  classesCollection,
  substituteRequestsCollection,
} from '$lib/data/collections'
import { subRequestClassId } from '$lib/helpers/subClasses'
import { adminDb } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'
import type {
  DocumentReference,
  DocumentSnapshot,
} from 'firebase-admin/firestore'

/**
 * A substitute request, the class it covers, and the proof that the caller is
 * the person covering it.
 */
export interface AuthorizedSubstituteSession {
  subRequestRef: DocumentReference
  subRequest: Data.SubRequest
  classRef: DocumentReference
  classData: Data.Class
  classId: string
  /** 1-based, the way the schedule and the feedback form count sessions. */
  classNumber: number
}

/**
 * Loads a substitute request and establishes that `uid` may act on it.
 *
 * This is the whole reason these two operations are server-side. Holding a
 * substituted class and filing its feedback both write to the *class*
 * document, and `firestore.rules`'s `isInstructorOfClass()` admits only the
 * class's own instructor and its co-instructors - a substitute is neither, so
 * the client SDK was refused (403) every time. The substitute's claim to write
 * lives in a different document altogether: the sub request naming them as
 * `subInstructorId`. Rules can't follow that link (the request's path depends
 * on the session being recorded, which the rule can't know), so the Admin SDK
 * checks it here instead.
 *
 * Every failure is a distinct status and message, because the client used to
 * get a bare `permission-denied` it logged to the console and showed nobody.
 */
export async function authorizeSubstituteSession(
  uid: string,
  subRequestId: string,
): Promise<AuthorizedSubstituteSession> {
  const subRequestRef = adminDb.doc(
    `${substituteRequestsCollection}/${subRequestId}`,
  )
  const subRequestSnap: DocumentSnapshot = await subRequestRef.get()
  if (!subRequestSnap.exists) {
    throw error(404, 'That substitute request no longer exists.')
  }
  const subRequest = subRequestSnap.data() as Data.SubRequest

  if (!subRequest.subInstructorId || subRequest.subInstructorId !== uid) {
    // Deliberately the same message whether nobody has signed up yet or
    // somebody else did: either way the caller is not covering this class,
    // and the difference is none of their business.
    throw error(403, 'You are not the substitute for that class.')
  }

  const classId = subRequestClassId(subRequestId)
  if (!classId) {
    throw error(400, 'That substitute request is not attached to a class.')
  }

  const classRef = adminDb.doc(`${classesCollection}/${classId}`)
  const classSnap = await classRef.get()
  if (!classSnap.exists) {
    throw error(404, 'The class for that substitute request no longer exists.')
  }
  const classData = classSnap.data() as Data.Class

  const classNumber = Number(subRequest.classNumber)
  // The per-session arrays are indexed by `classNumber - 1`. An index off the
  // end doesn't fail - it silently extends the array with holes, corrupting a
  // week that isn't on the schedule - so it is checked before anything writes.
  if (
    !Number.isInteger(classNumber) ||
    classNumber < 1 ||
    classNumber > (classData.classStatuses?.length ?? 0)
  ) {
    throw error(
      400,
      'That class session is no longer on the schedule. Ask the class’s instructor to check the dates.',
    )
  }

  return {
    subRequestRef,
    subRequest,
    classRef,
    classData,
    classId,
    classNumber,
  }
}

/** Whether this request has already been recorded as held. */
export function alreadyRecorded(subRequest: Data.SubRequest): boolean {
  return (
    subRequest.subRequestStatus === SubRequestStatus.SubstituteFeedbackNeeded ||
    subRequest.subRequestStatus === SubRequestStatus.NoSubstituteNeeded
  )
}
