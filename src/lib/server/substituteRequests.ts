import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import {
  classesCollection,
  substituteRequestsCollection,
} from '$lib/data/collections'
import { parseClassDocId, parseSubRequestDocId } from '$lib/data/docIds'
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
 * Whether a sub request's uids really name the class's instructors, as
 * buildSubRequestPayload writes them: `originalInstructorUid` is the class's
 * instructor of record, and `requestedByUid`, when present, teaches the class.
 *
 * Both fields are written by the requester through the client SDK, and
 * firestore.rules only checks that one of them is the requester. So neither
 * can be trusted alone: checking just `requestedByUid` let anybody file a
 * request naming a class's real owner as requester and themselves as
 * `originalInstructorUid`, and a claim then opened that class's roster to
 * whichever substitute they chose. Requiring both to name the class's
 * instructors means the requester - being one of them - teaches the class.
 */
function isFiledByInstructorsOf(
  subRequest: Partial<Data.SubRequest>,
  classId: string,
  classData: Data.Class,
): boolean {
  // A class without an instructorUid predates the field; its id still
  // records who created it (see parseClassDocId).
  const instructorOfRecord =
    classData.instructorUid || parseClassDocId(classId)?.instructorUid || ''
  if (
    !instructorOfRecord ||
    subRequest.originalInstructorUid !== instructorOfRecord
  ) {
    return false
  }
  return (
    !subRequest.requestedByUid ||
    subRequest.requestedByUid === instructorOfRecord ||
    isInstructorOfClass(classData, { uid: subRequest.requestedByUid })
  )
}

/**
 * Signs `caller` up to cover one session, in a transaction, so two instructors
 * signing up for the same session at once can't both be recorded on it.
 *
 * Refused when the request is gone, already has a substitute, is the caller's
 * own, is for a session that has already happened, or was not filed by
 * someone who teaches the class (see isFiledByInstructorsOf). That last check matters because covering a
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
  const parsed = parseSubRequestDocId(subRequestId)
  if (!parsed) {
    throw error(404, 'That substitute request no longer exists.')
  }
  const subRequestRef = adminDb.doc(
    `${substituteRequestsCollection}/${subRequestId}`,
  )
  const classRef = adminDb.doc(`${classesCollection}/${parsed.classId}`)

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

    const classSnap = await transaction.get(classRef)
    if (
      !classSnap.exists ||
      !isFiledByInstructorsOf(
        subRequest,
        parsed.classId,
        classSnap.data() as Data.Class,
      )
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
    }
    transaction.update(subRequestRef, claim)

    return { ...subRequest, ...claim, id: subRequestId, dateOfClass }
  })
}
