import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import {
  classesCollection,
  substituteRequestsCollection,
} from '$lib/data/collections'
import { subRequestClassId } from '$lib/helpers/subClasses'
import { isInstructorOfClass } from '$lib/server/classDirectory'
import { adminDb } from '$lib/server/firebase'
import { canSubstitute } from '$lib/server/instructorDirectory'
import { error } from '@sveltejs/kit'

/**
 * A session on the "Sign Up To Substitute A Class" list: only what the list
 * shows. Notes, the meeting link and the requester's address come with the
 * claim, once the session is the caller's to teach.
 */
export interface OpenSubRequest {
  id: string
  course: string
  classNumber: number
  /** ISO string. */
  dateOfClass: string
}

/** A sub request as it crosses the wire: its session date as an ISO string. */
export type SerializedSubRequest = Omit<Data.SubRequest, 'dateOfClass'> & {
  dateOfClass: string
}

export interface SubstituteCaller {
  uid: string
  email: string
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  return new Date(value as string)
}

export function serializeSubRequest(
  subRequest: Data.SubRequest,
): SerializedSubRequest {
  return { ...subRequest, dateOfClass: subRequest.dateOfClass.toISOString() }
}

/** Whether `uid` asked for this cover or teaches the class it is for. */
function isOwnRequest(subRequest: Partial<Data.SubRequest>, uid: string) {
  return (
    subRequest.requestedByUid === uid ||
    subRequest.originalInstructorUid === uid
  )
}

async function requireSubstituteEligible(uid: string) {
  if (!(await canSubstitute(uid))) {
    throw error(
      403,
      'Only accepted instructors and substitutes can cover classes.',
    )
  }
}

/**
 * The sessions `uid` could sign up to cover: still needing a substitute,
 * still to come, and asked for by somebody else, soonest first.
 *
 * The status and date are filtered in the query itself (see the
 * `subRequestStatus`/`dateOfClass` index in admin's firestore.indexes.json);
 * only the caller's own requests are dropped afterwards.
 */
export async function fetchOpenSubRequests(
  uid: string,
): Promise<OpenSubRequest[]> {
  await requireSubstituteEligible(uid)

  const snap = await adminDb
    .collection(substituteRequestsCollection)
    .where('subRequestStatus', '==', SubRequestStatus.SubstituteNeeded)
    .where('dateOfClass', '>', new Date())
    .orderBy('dateOfClass')
    .get()

  return snap.docs
    .filter((doc) => !isOwnRequest(doc.data(), uid))
    .map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        course: data.course ?? '',
        classNumber: data.classNumber,
        dateOfClass: toDate(data.dateOfClass).toISOString(),
      }
    })
}

/**
 * Signs `caller` up to cover one session, in a transaction, so two instructors
 * signing up for the same session at once can't both be recorded on it.
 *
 * Refused when the request is gone, already has a substitute, is the caller's
 * own, is for a session that has already happened, or was not filed by
 * someone who teaches the class. That last check matters because covering a
 * session is what opens its class roster to the substitute (see
 * authorizeSubstituteSession): a request for a class its requester doesn't
 * teach must not be claimable.
 *
 * Returns the request as claimed, with `dateOfClass` as a Date.
 */
export async function claimSubRequest(
  caller: SubstituteCaller,
  subRequestId: string,
): Promise<Data.SubRequest> {
  await requireSubstituteEligible(caller.uid)

  const profile = (await adminDb.doc(`users/${caller.uid}`).get()).data() ?? {}
  const subRequestRef = adminDb.doc(
    `${substituteRequestsCollection}/${subRequestId}`,
  )
  const classRef = adminDb.doc(
    `${classesCollection}/${subRequestClassId(subRequestId)}`,
  )

  return adminDb.runTransaction(async (transaction) => {
    const subRequestSnap = await transaction.get(subRequestRef)
    if (!subRequestSnap.exists) {
      throw error(404, 'That substitute request no longer exists.')
    }
    const subRequest = subRequestSnap.data() as Data.SubRequest

    if (subRequest.subRequestStatus !== SubRequestStatus.SubstituteNeeded) {
      throw error(409, 'Somebody has already signed up to cover that class.')
    }
    if (isOwnRequest(subRequest, caller.uid)) {
      throw error(403, 'You cannot cover a class you asked cover for.')
    }
    const dateOfClass = toDate(subRequest.dateOfClass)
    if (!(dateOfClass > new Date())) {
      throw error(400, 'That class has already happened.')
    }

    const requesterUid =
      subRequest.requestedByUid || subRequest.originalInstructorUid || ''
    const classSnap = await transaction.get(classRef)
    if (
      !requesterUid ||
      !classSnap.exists ||
      !isInstructorOfClass(classSnap.data() as Data.Class, {
        uid: requesterUid,
      })
    ) {
      throw error(
        400,
        'That substitute request was not filed by an instructor of its class.',
      )
    }

    const claim = {
      subRequestStatus: SubRequestStatus.SubstituteFound,
      subInstructorId: caller.uid,
      subInstructorFirstName: profile.firstName ?? '',
      subInstructorEmail: caller.email,
    }
    transaction.update(subRequestRef, claim)

    return { ...subRequest, ...claim, id: subRequestId, dateOfClass }
  })
}
