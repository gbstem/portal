import { ClassStatus } from '$lib/components/helpers/ClassStatus'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import {
  classesCollection,
  instructorFeedbackCollection,
  substituteRequestsCollection,
  withSemester,
} from '$lib/data/collections'
import { subRequestClassId } from '$lib/helpers/subClasses'
import { adminDb } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'
import type {
  DocumentReference,
  DocumentSnapshot,
  Transaction,
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
 *
 * Pass `transaction` when the caller will write from what this reads, so the
 * reads are part of that transaction.
 */
export async function authorizeSubstituteSession(
  uid: string,
  subRequestId: string,
  transaction?: Transaction,
): Promise<AuthorizedSubstituteSession> {
  const read = (ref: DocumentReference): Promise<DocumentSnapshot> =>
    transaction ? transaction.get(ref) : ref.get()
  const subRequestRef = adminDb.doc(
    `${substituteRequestsCollection}/${subRequestId}`,
  )
  const subRequestSnap = await read(subRequestRef)
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
  const classSnap = await read(classRef)
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

export interface RecordedSubstituteSession {
  /** Where to send the substitute, read from the class rather than the client. */
  meetingLink: string
  /** True when this session had already been recorded as held. */
  alreadyRecorded: boolean
}

/**
 * Records that substitute `uid` is holding the session `subRequestId` covers:
 * marks the session held on the class and moves the request to "feedback
 * needed".
 *
 * Both writes used to happen in the browser, where firestore.rules refused
 * them for anyone who wasn't already an instructor of the class - which a
 * substitute never is. They are one transaction, not just one batch, because
 * the class's per-session arrays are rewritten from the copy just read: read
 * outside it, a write the instructor made to the same class in between (their
 * own week recorded, say) would be overwritten.
 *
 * Joining twice is an ordinary thing to do - a dropped call, a second browser
 * tab - so a session already recorded is left alone, and the link comes back
 * either way.
 */
export async function recordSubstituteSession(
  uid: string,
  subRequestId: string,
): Promise<RecordedSubstituteSession> {
  return adminDb.runTransaction(async (transaction) => {
    const { subRequest, subRequestRef, classRef, classData, classNumber } =
      await authorizeSubstituteSession(uid, subRequestId, transaction)

    const recorded: RecordedSubstituteSession = {
      meetingLink: classData.meetingLink ?? '',
      alreadyRecorded: alreadyRecorded(subRequest),
    }
    if (recorded.alreadyRecorded) {
      return recorded
    }

    const classStatuses = [...(classData.classStatuses ?? [])]
    classStatuses[classNumber - 1] = ClassStatus.FeedbackIncomplete
    transaction.update(classRef, {
      completedClassDates: [
        ...(classData.completedClassDates ?? []),
        subRequest.dateOfClass,
      ],
      classStatuses,
    })
    transaction.update(subRequestRef, {
      subRequestStatus: SubRequestStatus.SubstituteFeedbackNeeded,
    })
    return recorded
  })
}

export interface SubstituteFeedback {
  subRequestId: string
  date: string
  feedback: string
  /** Keyed by student name, the way the roster renders them. */
  attendanceList: Record<string, { present: boolean }>
  classNumber: number
}

/**
 * Files substitute `uid`'s feedback for the class they covered: saves the
 * feedback document, marks the session complete on the class, and closes the
 * request out. Returns the feedback document's id.
 *
 * Server-side for the same reason as recordSubstituteSession: marking the
 * session complete writes to the class document, which a substitute cannot
 * write from the browser. That failure was the quiet one - the feedback
 * document itself saved fine, so the form said "Class Feedback saved!" while
 * the class was never updated and the request never left "feedback needed",
 * which is also the state community service hours are counted from.
 *
 * One transaction: the three writes land together, and the class arrays are
 * rewritten from the copy read inside it.
 */
export async function fileSubstituteFeedback(
  uid: string,
  feedback: SubstituteFeedback,
): Promise<string> {
  return adminDb.runTransaction(async (transaction) => {
    const {
      subRequest,
      subRequestRef,
      classRef,
      classData,
      classId,
      classNumber,
    } = await authorizeSubstituteSession(
      uid,
      feedback.subRequestId,
      transaction,
    )

    // Checked against the request rather than trusted: the form lets it be
    // typed, and a substitute is covering one specific session.
    if (feedback.classNumber !== classNumber) {
      throw error(
        400,
        `That request is for class #${classNumber}, so its feedback has to be too.`,
      )
    }

    const feedbackCompleted = [...(classData.feedbackCompleted ?? [])]
    const classStatuses = [...(classData.classStatuses ?? [])]
    feedbackCompleted[classNumber - 1] = true
    classStatuses[classNumber - 1] = ClassStatus.EverythingComplete

    const feedbackId = `${classId}-${Date.now()}`
    transaction.set(
      adminDb.doc(`${instructorFeedbackCollection}/${feedbackId}`),
      withSemester({
        date: feedback.date,
        feedback: feedback.feedback,
        attendanceList: feedback.attendanceList,
        classNumber,
        // Both read off the request, not the browser: this is the record of
        // who actually taught the session and which course it was.
        courseName: subRequest.course ?? '',
        instructorName: subRequest.subInstructorFirstName ?? '',
      }),
    )
    transaction.update(classRef, { feedbackCompleted, classStatuses })
    // Closing the request out is what credits the substitute's community
    // service hours, so it belongs with the feedback.
    transaction.update(subRequestRef, {
      subRequestStatus: SubRequestStatus.NoSubstituteNeeded,
    })
    return feedbackId
  })
}
