import { db } from '$lib/client/firebase'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import type Student from '$lib/components/types/Student'
import {
  classesCollection,
  instructorFeedbackCollection,
  registrationsCollection,
  studentFeedbackCollection,
  substituteRequestsCollection,
  withSemester,
} from '$lib/data/collections'
import {
  buildSubRequestPayload,
  transformStudentDocData,
} from '$lib/helpers/classSchedule'
import { instructorClassMappingDiff } from '$lib/helpers/classDetailsForm'
import type { CoInstructor } from '$lib/helpers/classDetailsForm'
import {
  parseClassInfoDoc,
  sortClassesBySpotsRemaining,
  type ClassInfo,
} from '$lib/helpers/classesPage'
import { timestampToDate } from '$lib/utils'
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

const instructorClassesCollection = 'instructorClasses'

export interface InstructorFeedbackSubmission {
  date: string
  feedback: string
  attendanceList: Record<string, { present: boolean }>
  courseName: string
  classNumber: number
  instructorName: string
}

export interface StudentFeedbackSubmission {
  studentId: string
  date: string
  classId: string
  rating: number
  feedback: string
  instructor: string
  studentName: string
  course: string
}

/**
 * Service providing Data Access Layer for Class Schedule management.
 */
export const classService = {
  /**
   * Fetches student profile details for a list of student UIDs.
   */
  async fetchStudentList(studentUids: string[]): Promise<Student[]> {
    const students: Student[] = []
    const promises = studentUids.map(async (uid) => {
      const studentDocRef = doc(db, registrationsCollection, uid)
      const snap = await getDoc(studentDocRef)
      if (snap.exists()) {
        const student = transformStudentDocData(snap.data())
        if (student) {
          students.push(student)
        }
      }
    })
    await Promise.all(promises)
    return students
  },

  /**
   * Fetches full details for a single class by ID.
   */
  async fetchClassDetails(classId: string): Promise<Data.Class | null> {
    const snap = await getDoc(doc(db, classesCollection, classId))
    if (!snap.exists()) return null
    return snap.data() as Data.Class
  },

  /**
   * Fetches student list enrolled in a class given the classId.
   */
  async fetchStudentListForClass(classId: string): Promise<Student[]> {
    const classDetails = await this.fetchClassDetails(classId)
    if (!classDetails || !classDetails.students) return []
    return this.fetchStudentList(classDetails.students)
  },

  /**
   * Updates classStatuses field on a class document.
   */
  async updateClassStatuses(
    classId: string,
    updatedStatuses: string[],
  ): Promise<void> {
    const classRef = doc(db, classesCollection, classId)
    await updateDoc(classRef, { classStatuses: updatedStatuses })
  },

  /**
   * Updates meetingTimes, feedbackCompleted, and classStatuses for a class.
   */
  async updateMeetingTimes(
    classId: string,
    meetingTimes: Date[],
    feedbackCompleted: boolean[],
    classStatuses: string[],
  ): Promise<void> {
    const classRef = doc(db, classesCollection, classId)
    await updateDoc(classRef, {
      meetingTimes,
      feedbackCompleted,
      classStatuses,
    })
  },

  /**
   * Updates recorded completed class dates and class statuses for a class session.
   */
  async recordClassSession(
    classId: string,
    completedClassDates: Date[],
    classStatuses: string[],
  ): Promise<void> {
    const classRef = doc(db, classesCollection, classId)
    await updateDoc(classRef, {
      completedClassDates,
      classStatuses,
    })
  },

  /**
   * Submits a substitute teacher request.
   */
  async submitSubRequest(
    classId: string,
    subRequestClassNumber: number,
    subRequestDate: string,
    subRequestNotes: string,
    course: string,
    instructorEmail: string,
    meetingLink: string,
    instructorUid?: string,
  ): Promise<void> {
    const subRequest = buildSubRequestPayload({
      classId,
      subRequestClassNumber,
      subRequestDate,
      subRequestNotes,
      course,
      instructorEmail,
      meetingLink,
      instructorUid,
    })

    const docRef = doc(
      db,
      substituteRequestsCollection,
      `${classId}---${subRequestClassNumber}`,
    )
    await setDoc(docRef, subRequest)
  },

  /**
   * Updates full class details document (used in ClassDetailsForm).
   */
  async saveClassDetails(
    classId: string,
    classDetails: Partial<Data.ClassDetails>,
  ): Promise<void> {
    const classRef = doc(db, classesCollection, classId)
    await setDoc(
      classRef,
      {
        ...classDetails,
        // This is a `{ merge: true }` write, so omitting the retired
        // `otherInstructorEmails` field would leave the stale string sitting
        // on the document forever. Deleting it explicitly means every save
        // cleans up a document the backfill hasn't reached yet.
        //
        // TODO(otherInstructorEmails migration, remove ~2026-12-01): drop
        // this once `yarn backfill:coinstructors --drop-legacy-field` has run
        // against production and no class document carries the field.
        otherInstructorEmails: deleteField(),
      },
      { merge: true },
    )
  },

  /**
   * Gets all classes an instructor has access to, both classes explicitly
   * shared with them (via the uid-keyed instructorClasses mapping) and
   * classes they own (class ID prefixed with their UID).
   * Returns an empty object (rather than throwing) on fetch failure, since
   * callers treat "no accessible classes" and "fetch failed" the same way.
   */
  async fetchInstructorClasses(
    instructorUID: string,
  ): Promise<{ [classId: string]: Data.Class }> {
    try {
      const instructorClassesDoc = await getDoc(
        doc(db, instructorClassesCollection, instructorUID),
      )
      let accessibleClassIds: string[] = []

      if (instructorClassesDoc.exists()) {
        accessibleClassIds = instructorClassesDoc.data()?.classIds || []
      }

      const allClassesSnapshot = await getDocs(
        collection(db, classesCollection),
      )
      const ownedClassIds: string[] = []

      allClassesSnapshot.forEach((classDoc) => {
        if (classDoc.id.startsWith(instructorUID + '-')) {
          ownedClassIds.push(classDoc.id)
        }
      })

      const allClassIds = [
        ...new Set([...accessibleClassIds, ...ownedClassIds]),
      ]

      const classDocs = await Promise.all(
        allClassIds.map((classId) =>
          getDoc(doc(db, classesCollection, classId)),
        ),
      )
      const classes: { [classId: string]: Data.Class } = {}

      classDocs.forEach((classDoc, index) => {
        if (classDoc.exists()) {
          const classData = classDoc.data() as Data.Class
          if (classData.meetingTimes) {
            classData.meetingTimes = classData.meetingTimes.map((time) =>
              timestampToDate(time),
            )
          }
          if (classData.completedClassDates) {
            classData.completedClassDates = classData.completedClassDates.map(
              (time) => timestampToDate(time),
            )
          }
          classes[allClassIds[index]] = classData
        }
      })

      return classes
    } catch (error) {
      console.error('Error fetching instructor classes:', error)
      return {}
    }
  },

  /**
   * Brings the instructorClasses index in line with a class's co-instructor
   * list: the owner and every current co-instructor can reach the class, and
   * anyone dropped from the list stops seeing it.
   *
   * This index is a convenience, not the authorization boundary. Write access
   * is decided by firestore.rules's isInstructorOfClass(), which reads the
   * class document's own `otherInstructorUids`; the class write that precedes
   * this call is what actually grants or revokes it. So a failure here leaves
   * a removed co-instructor still seeing the class on their dashboard, but
   * unable to edit it - which is why it warns rather than throwing.
   */
  async updateInstructorClassMappings(
    classId: string,
    mainInstructorUid: string,
    previousOtherUids: string[],
    nextOtherUids: string[],
  ): Promise<void> {
    const { added, removed } = instructorClassMappingDiff(
      previousOtherUids,
      nextOtherUids,
      mainInstructorUid,
    )

    // allSettled, not a sequential loop: one instructor's mapping failing
    // shouldn't decide whether the rest get updated.
    const results = await Promise.allSettled([
      addInstructorToClass(mainInstructorUid, classId),
      ...added.map((uid) => addInstructorToClass(uid, classId)),
      ...removed.map((uid) => removeInstructorFromClass(uid, classId)),
    ])
    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length > 0) {
      console.error(
        `Failed to update ${failures.length} instructorClasses mapping(s) for ${classId}:`,
        failures,
      )
    }
  },

  /**
   * Resolves one co-instructor email to their identity, or an error message
   * explaining why it can't be used.
   *
   * The server is the only side that can answer this: a client can't read
   * another account's uid, `users` document, or decision. See
   * /api/lookupCoInstructor for why every rejection gets the same message.
   */
  async lookupCoInstructor(
    email: string,
  ): Promise<
    { ok: true; coInstructor: CoInstructor } | { ok: false; message: string }
  > {
    try {
      const res = await fetch('/api/lookupCoInstructor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = await res.json()
      if (!res.ok) {
        return {
          ok: false,
          message:
            body?.message ||
            'Could not check that email address. Please try again.',
        }
      }
      return { ok: true, coInstructor: body.instructor }
    } catch (error) {
      console.error('Error looking up a co-instructor:', error)
      return {
        ok: false,
        message: 'Could not check that email address. Please try again.',
      }
    }
  },

  /**
   * Expands a class's stored `otherInstructorUids` into displayable
   * identities. Uids whose account has been deleted come back omitted; see
   * resolveCoInstructorIdentities on the server.
   *
   * Throws on a transport failure rather than returning [], because callers
   * use the result to decide which stored uids to keep - and silently
   * returning "none of them resolved" would let one failed request wipe a
   * class's co-instructors on the next save.
   */
  async resolveCoInstructors(uids: string[]): Promise<CoInstructor[]> {
    if (uids.length === 0) return []
    const res = await fetch('/api/resolveCoInstructors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uids }),
    })
    if (!res.ok) {
      throw new Error(`Failed to resolve co-instructors (${res.status})`)
    }
    const { instructors } = (await res.json()) as {
      instructors: CoInstructor[]
    }
    return instructors
  },

  /**
   * Fetches multiple class documents by ID, silently omitting any that don't exist.
   */
  async fetchClassesByIds(
    classIds: string[],
  ): Promise<(Data.Class & { id: string })[]> {
    const snaps = await Promise.all(
      classIds.map((classId) => getDoc(doc(db, classesCollection, classId))),
    )
    const classes: (Data.Class & { id: string })[] = []
    snaps.forEach((snap) => {
      if (snap.exists()) {
        classes.push({ ...(snap.data() as Data.Class), id: snap.id })
      }
    })
    return classes
  },

  /**
   * Fetches all class offerings, parsed and sorted by spots remaining.
   */
  async fetchAllClassesInfo(): Promise<ClassInfo[]> {
    const querySnapshot = await getDocs(collection(db, classesCollection))
    const rawClasses = querySnapshot.docs.map((classDoc) =>
      parseClassInfoDoc(classDoc.id, classDoc.data()),
    )
    return sortClassesBySpotsRemaining(rawClasses)
  },

  /**
   * Fetches a class's current enrollment count and capacity.
   */
  async fetchClassCapacityInfo(
    classId: string,
  ): Promise<{ numStudents: number; classCap: number }> {
    const classDoc = await getDoc(doc(db, classesCollection, classId))
    const classData = classDoc.data()
    return {
      numStudents: classData?.students?.length ?? 0,
      classCap: classData?.classCap ?? 0,
    }
  },

  /**
   * Fetches whether a student's registration has the age-limit bypass enabled.
   */
  async fetchBypassAgeLimits(studentUid: string): Promise<boolean> {
    const snap = await getDoc(doc(db, registrationsCollection, studentUid))
    return Boolean(snap.data()?.agreements.bypassAgeLimits)
  },

  /**
   * Adds a student to a class's roster.
   */
  async enrollStudentInClass(
    classId: string,
    studentUid: string,
  ): Promise<void> {
    await updateDoc(doc(db, classesCollection, classId), {
      students: arrayUnion(studentUid),
    })
  },

  /**
   * Records a class enrollment on the student's own registration document.
   */
  async confirmStudentClassEnrollment(
    studentUid: string,
    classId: string,
  ): Promise<void> {
    await updateDoc(doc(db, registrationsCollection, studentUid), {
      classes: arrayUnion(classId),
      enrolled: true,
    })
  },

  /**
   * Removes a student from a class's roster.
   */
  async unenrollStudentFromClass(
    classId: string,
    studentUid: string,
  ): Promise<void> {
    await updateDoc(doc(db, classesCollection, classId), {
      students: arrayRemove(studentUid),
    })
  },

  /**
   * Removes a class from the student's registration document and updates
   * `enrolled` based on whether any classes remain.
   */
  async confirmStudentClassUnenrollment(
    studentUid: string,
    classId: string,
  ): Promise<void> {
    const registrationDocRef = doc(db, registrationsCollection, studentUid)
    await updateDoc(registrationDocRef, { classes: arrayRemove(classId) })
    const regSnap = await getDoc(registrationDocRef)
    const remainingClasses = (regSnap.data()?.classes || []) as string[]
    await updateDoc(registrationDocRef, {
      enrolled: remainingClasses.length > 0,
    })
  },

  /**
   * Fetches student display names for a list of UIDs, preserving input order.
   * Individual lookup failures resolve to 'Error' rather than rejecting the batch.
   */
  async fetchStudentNames(studentUids: string[]): Promise<string[]> {
    return Promise.all(
      studentUids.map(async (uid) => {
        try {
          const userDoc = await getDoc(doc(db, registrationsCollection, uid))
          const userData = userDoc.data()?.personal
          return `${userData?.studentFirstName} ${userData?.studentLastName}`
        } catch (error) {
          console.error('Error fetching student data:', error)
          return 'Error'
        }
      }),
    )
  },

  /**
   * Records instructor feedback for a class session: saves the feedback doc,
   * marks the session complete on the class document, and (if this was a
   * substitute-taught session) closes out the substitute request.
   */
  async submitInstructorFeedback(
    classId: string,
    feedback: InstructorFeedbackSubmission,
    feedbackCompleted: boolean[],
    classStatuses: string[],
    subRequestId?: string,
  ): Promise<void> {
    await setDoc(
      doc(db, instructorFeedbackCollection, `${classId}-${Date.now()}`),
      withSemester(feedback),
    )
    await updateDoc(doc(db, classesCollection, classId), {
      feedbackCompleted,
      classStatuses,
    })
    if (subRequestId !== undefined) {
      await updateDoc(doc(db, substituteRequestsCollection, subRequestId), {
        subRequestStatus: SubRequestStatus.NoSubstituteNeeded,
      })
    }
  },

  /**
   * Records a parent/student's weekly feedback for a class.
   */
  async submitStudentFeedback(
    classId: string,
    feedback: StudentFeedbackSubmission,
  ): Promise<void> {
    await setDoc(
      doc(db, studentFeedbackCollection, `${classId}-${Date.now()}`),
      withSemester(feedback),
    )
  },
}

/**
 * Grants an instructor access to a class via the instructorClasses mapping,
 * creating the mapping document if it doesn't exist yet.
 */
async function addInstructorToClass(
  instructorUid: string,
  classId: string,
): Promise<void> {
  const instructorClassesRef = doc(
    db,
    instructorClassesCollection,
    instructorUid,
  )

  try {
    await updateDoc(instructorClassesRef, {
      classIds: arrayUnion(classId),
    })
  } catch {
    await setDoc(instructorClassesRef, {
      classIds: [classId],
    })
  }
}

/**
 * Revokes an instructor's access to a class in the instructorClasses mapping.
 *
 * Unlike `addInstructorToClass` there's no create-on-missing fallback: if the
 * mapping document doesn't exist there is nothing to revoke, and `updateDoc`
 * failing on a missing document is the expected outcome rather than an error
 * worth surfacing.
 */
async function removeInstructorFromClass(
  instructorUid: string,
  classId: string,
): Promise<void> {
  const instructorClassesRef = doc(
    db,
    instructorClassesCollection,
    instructorUid,
  )

  try {
    await updateDoc(instructorClassesRef, {
      classIds: arrayRemove(classId),
    })
  } catch (error) {
    console.error(
      `Could not revoke ${instructorUid}'s mapping for class ${classId}:`,
      error,
    )
  }
}
