import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import {
  classesCollection,
  substituteRequestsCollection,
} from '$lib/data/collections'
import {
  parseClassDocId,
  parseSubRequestDocId,
  subRequestDocId,
} from '$lib/data/docIds'
import { buildSubRequestPayload } from '$lib/helpers/classSchedule'
import { isInstructorOfClass } from '$lib/server/classDirectory'
import { adminDb } from '$lib/server/firebase'
import {
  canSubstitute,
  isAcceptedInstructor,
} from '$lib/server/instructorDirectory'
import { error } from '@sveltejs/kit'
import type { Transaction } from 'firebase-admin/firestore'

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

/** What an instructor chooses when filing or editing a sub request. */
export interface SubRequestInput {
  /** 1-based, the way the schedule counts sessions. */
  classNumber: number
  dateOfClass: Date
  notes: string
}

export const SESSION_ALREADY_REQUESTED =
  "That session already has a sub request, so it wasn't filed again."

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

/** A session number that names one of the class's scheduled sessions. */
function requireScheduledSession(classData: Data.Class, classNumber: number) {
  const sessions = classData.meetingTimes?.length ?? 0
  if (
    !Number.isInteger(classNumber) ||
    classNumber < 1 ||
    classNumber > sessions
  ) {
    throw error(400, 'That class session is not on the schedule.')
  }
}

/**
 * Files a request for cover of one session of class `classId`, as an
 * accepted instructor who owns or co-teaches it. Returns the request's id.
 *
 * Only the session, its date and the notes come from the caller. Who the
 * request names - the class's instructor of record, and the caller as the one
 * asking - comes from the class document and the session, which is what
 * isFiledByInstructorsOf checks at claim time; firestore.rules could only
 * check that one of those uids was the caller's.
 *
 * A session has one request document, so filing for one that already has a
 * request is refused rather than overwriting it - and whoever may already be
 * covering it.
 */
export async function fileSubRequest(
  caller: { uid: string },
  classId: string,
  input: SubRequestInput,
): Promise<string> {
  if (!(await isAcceptedInstructor(caller.uid))) {
    throw error(403, 'Only accepted instructors can request a substitute.')
  }
  const classRef = adminDb.doc(`${classesCollection}/${classId}`)
  const subRequestId = subRequestDocId(classId, input.classNumber)
  const subRequestRef = adminDb.doc(
    `${substituteRequestsCollection}/${subRequestId}`,
  )

  return adminDb.runTransaction(async (transaction) => {
    const classSnap = await transaction.get(classRef)
    if (!classSnap.exists) {
      throw error(404, 'That class no longer exists.')
    }
    const classData = classSnap.data() as Data.Class
    if (!isInstructorOfClass(classData, { uid: caller.uid })) {
      throw error(403, 'You are not an instructor of that class.')
    }
    requireScheduledSession(classData, input.classNumber)
    if ((await transaction.get(subRequestRef)).exists) {
      throw error(409, SESSION_ALREADY_REQUESTED)
    }

    transaction.set(
      subRequestRef,
      buildSubRequestPayload({
        classId,
        subRequestClassNumber: input.classNumber,
        subRequestDate: input.dateOfClass.toISOString(),
        subRequestNotes: input.notes,
        course: classData.course ?? '',
        meetingLink: classData.meetingLink ?? '',
        instructorUid: classData.instructorUid,
        requestedByUid: caller.uid,
      }),
    )
    return subRequestId
  })
}

/**
 * Loads a request for its requester or the class's instructor of record -
 * the people firestore.rules let edit and cancel one when that happened in
 * the browser - inside `transaction`.
 */
async function getOwnSubRequest(
  transaction: Transaction,
  uid: string,
  subRequestId: string,
) {
  const parsed = parseSubRequestDocId(subRequestId)
  const subRequestRef = adminDb.doc(
    `${substituteRequestsCollection}/${subRequestId}`,
  )
  const snap = await transaction.get(subRequestRef)
  if (!parsed || !snap.exists) {
    throw error(404, 'That substitute request no longer exists.')
  }
  const subRequest = snap.data() as Data.SubRequest
  if (!isOwnRequest(subRequest, uid)) {
    throw error(403, 'That substitute request is not yours to change.')
  }
  return { subRequest, subRequestRef, classId: parsed.classId }
}

/**
 * Changes the session, date or notes of one of the caller's own requests.
 * Returns its id, which changes with the session.
 *
 * Moving to another session moves the document: the request is written at
 * the new session and removed from the old one in the same transaction, so a
 * failure can't leave it at both, and a session that already has a request is
 * refused rather than overwritten. A request somebody has signed up for stays
 * at its session - the substitute agreed to cover that one - so moving it is
 * refused too; its date and notes can still change.
 */
export async function editSubRequest(
  caller: { uid: string },
  subRequestId: string,
  input: SubRequestInput,
): Promise<string> {
  return adminDb.runTransaction(async (transaction) => {
    const { subRequest, subRequestRef, classId } = await getOwnSubRequest(
      transaction,
      caller.uid,
      subRequestId,
    )
    const edits = { dateOfClass: input.dateOfClass, notes: input.notes }

    if (input.classNumber === subRequest.classNumber) {
      transaction.update(subRequestRef, edits)
      return subRequestId
    }

    if (
      subRequest.subRequestStatus !== SubRequestStatus.SubstituteNeeded ||
      subRequest.subInstructorId
    ) {
      throw error(
        409,
        "Somebody has signed up to cover that session, so it can't be moved. Cancel it and file a new request instead.",
      )
    }
    const classSnap = await transaction.get(
      adminDb.doc(`${classesCollection}/${classId}`),
    )
    if (!classSnap.exists) {
      throw error(404, 'That class no longer exists.')
    }
    requireScheduledSession(classSnap.data() as Data.Class, input.classNumber)

    const movedId = subRequestDocId(classId, input.classNumber)
    const movedRef = adminDb.doc(`${substituteRequestsCollection}/${movedId}`)
    if ((await transaction.get(movedRef)).exists) {
      throw error(409, 'That session already has a sub request.')
    }
    // `id` is stored as the class id (see buildSubRequestPayload).
    transaction.set(movedRef, {
      ...subRequest,
      ...edits,
      id: classId,
      classNumber: input.classNumber,
    })
    transaction.delete(subRequestRef)
    return movedId
  })
}

/** Cancels one of the caller's own requests, whether or not it is covered. */
export async function cancelSubRequest(
  caller: { uid: string },
  subRequestId: string,
): Promise<void> {
  await adminDb.runTransaction(async (transaction) => {
    const { subRequestRef } = await getOwnSubRequest(
      transaction,
      caller.uid,
      subRequestId,
    )
    transaction.delete(subRequestRef)
  })
}
