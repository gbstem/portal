import { ClassStatus } from '$lib/components/helpers/ClassStatus'
import {
  classesCollection,
  instructorFeedbackCollection,
  registrationsCollection,
  studentFeedbackCollection,
  withSemester,
} from '$lib/data/collections'
import { isOwnRegistration } from '$lib/server/classEnrollments'
import { isInstructorOfClass } from '$lib/server/classDirectory'
import { adminDb } from '$lib/server/firebase'
import { isAcceptedInstructor } from '$lib/server/instructorDirectory'
import { error } from '@sveltejs/kit'

export interface FeedbackCaller {
  uid: string
}

/** What an instructor of the class types into InstructorFeedbackForm. */
export interface InstructorFeedback {
  classId: string
  date: string
  feedback: string
  /** Keyed by student name, the way the roster renders them. */
  attendanceList: Record<string, { present: boolean }>
  /** 1-based, the way the schedule and the feedback form count sessions. */
  classNumber: number
}

/** What a parent types into StudentFeedbackForm for one of their students. */
export interface StudentFeedback {
  studentId: string
  classId: string
  date: string
  rating: number
  feedback: string
}

/**
 * Feedback documents are named after their class and the moment they were
 * filed, the same as fileSubstituteFeedback's.
 */
function newFeedbackId(classId: string): string {
  return `${classId}-${Date.now()}`
}

/**
 * Files an instructor's feedback for one session of a class they teach: saves
 * the feedback document and marks the session complete on the class, in one
 * transaction. Returns the feedback document's id.
 *
 * A role is not an authorization to write about a class: the `instructor`
 * claim is granted at signup, before any interview. The caller must be an
 * accepted instructor and the class's owner or one of its co-instructors -
 * the same test firestore.rules applies to a class update. A substitute is
 * neither, and files through fileSubstituteFeedback instead.
 *
 * Everything but the reflection, the date, the attendance and the session is
 * read rather than taken from the caller: the course from the class, and the
 * name from the caller's own profile, since the reflection goes to curriculum
 * developers and has to name whoever actually wrote it.
 *
 * The session is marked complete on the class as read inside the transaction,
 * so a session a co-instructor or substitute recorded in the meantime is kept.
 */
export async function fileInstructorFeedback(
  caller: FeedbackCaller,
  feedback: InstructorFeedback,
): Promise<string> {
  if (!(await isAcceptedInstructor(caller.uid))) {
    throw error(403, 'Only accepted instructors can file class feedback.')
  }

  const classRef = adminDb.doc(`${classesCollection}/${feedback.classId}`)
  const profileRef = adminDb.doc(`users/${caller.uid}`)

  return adminDb.runTransaction(async (transaction) => {
    const classSnap = await transaction.get(classRef)
    const profileSnap = await transaction.get(profileRef)

    if (!classSnap.exists) {
      throw error(404, 'That class no longer exists.')
    }
    const classData = classSnap.data() as Data.Class
    // Uid only: no role is passed, so classDirectory's admin exception can't
    // apply.
    if (!isInstructorOfClass(classData, { uid: caller.uid })) {
      throw error(403, 'You are not an instructor of that class.')
    }

    const feedbackCompleted = [...(classData.feedbackCompleted ?? [])]
    const classStatuses = [...(classData.classStatuses ?? [])]
    // Indexed by session. Writing past the end would extend the arrays with
    // holes rather than fail, so a session off the schedule is refused.
    const index = feedback.classNumber - 1
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= feedbackCompleted.length ||
      index >= classStatuses.length
    ) {
      throw error(400, 'That class session is not on the schedule.')
    }
    feedbackCompleted[index] = true
    classStatuses[index] = ClassStatus.EverythingComplete

    const profile = profileSnap.data() ?? {}
    const feedbackId = newFeedbackId(feedback.classId)
    transaction.set(
      adminDb.doc(`${instructorFeedbackCollection}/${feedbackId}`),
      withSemester({
        date: feedback.date,
        feedback: feedback.feedback,
        attendanceList: feedback.attendanceList,
        classNumber: feedback.classNumber,
        courseName: classData.course ?? '',
        instructorName:
          `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim(),
      }),
    )
    transaction.update(classRef, { feedbackCompleted, classStatuses })
    return feedbackId
  })
}

/**
 * Files a parent's weekly feedback on a class one of their students is in.
 * Returns the feedback document's id.
 *
 * A role is not an authorization to write about a class: the `student` claim
 * is granted at registration, before any enrollment. The student must be one
 * of the caller's own (see isOwnRegistration) and on the class's roster. The
 * roster is the class's `students`, the side capacity, the instructor roster
 * and reminders all read; /api/enroll keeps the registration's `classes` in
 * step with it.
 *
 * The student's name, the course and the instructor's name are read from the
 * registration and the class, not taken from the caller.
 */
export async function fileStudentFeedback(
  caller: FeedbackCaller,
  feedback: StudentFeedback,
): Promise<string> {
  if (!isOwnRegistration(caller.uid, feedback.studentId)) {
    throw error(403, 'You can only send feedback for your own students.')
  }

  const classRef = adminDb.doc(`${classesCollection}/${feedback.classId}`)
  const registrationRef = adminDb.doc(
    `${registrationsCollection}/${feedback.studentId}`,
  )

  // A transaction rather than a plain write, so the student can't be dropped
  // from the class between the roster check and the save.
  return adminDb.runTransaction(async (transaction) => {
    const classSnap = await transaction.get(classRef)
    const registrationSnap = await transaction.get(registrationRef)

    if (!registrationSnap.exists) {
      throw error(404, 'That student has no registration.')
    }
    if (!classSnap.exists) {
      throw error(404, 'That class no longer exists.')
    }
    const classData = classSnap.data() as Data.Class
    if (!(classData.students ?? []).includes(feedback.studentId)) {
      throw error(403, 'That student is not enrolled in that class.')
    }
    const registration = registrationSnap.data() as Data.Registration

    const feedbackId = newFeedbackId(feedback.classId)
    transaction.set(
      adminDb.doc(`${studentFeedbackCollection}/${feedbackId}`),
      withSemester({
        studentId: feedback.studentId,
        classId: feedback.classId,
        date: feedback.date,
        rating: feedback.rating,
        feedback: feedback.feedback,
        studentName:
          `${registration.personal?.studentFirstName ?? ''} ${registration.personal?.studentLastName ?? ''}`.trim(),
        course: classData.course ?? '',
        instructor:
          `${classData.instructorFirstName ?? ''} ${classData.instructorLastName ?? ''}`.trim(),
      }),
    )
    return feedbackId
  })
}
