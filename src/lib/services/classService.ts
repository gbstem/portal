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
  ): Promise<void> {
    const subRequest = buildSubRequestPayload({
      classId,
      subRequestClassNumber,
      subRequestDate,
      subRequestNotes,
      course,
      instructorEmail,
      meetingLink,
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
    await setDoc(classRef, classDetails, { merge: true })
  },

  /**
   * Gets all classes an instructor has access to, both classes explicitly
   * shared with their email (via the instructorClasses mapping) and classes
   * they own (class ID prefixed with their UID, for backward compatibility).
   * Returns an empty object (rather than throwing) on fetch failure, since
   * callers treat "no accessible classes" and "fetch failed" the same way.
   */
  async fetchInstructorClasses(
    instructorUID: string,
    instructorEmail: string,
  ): Promise<{ [classId: string]: Data.Class }> {
    try {
      const instructorClassesDoc = await getDoc(
        doc(db, instructorClassesCollection, instructorEmail),
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
   * Ensures the main instructor and each comma-separated co-instructor email
   * has access to a class via the instructorClasses mapping.
   */
  async updateInstructorClassMappings(
    classId: string,
    mainInstructorEmail: string,
    otherInstructorEmails: string,
  ): Promise<void> {
    try {
      await addInstructorToClass(mainInstructorEmail, classId)

      if (otherInstructorEmails.trim()) {
        const coInstructorEmails = otherInstructorEmails
          .split(',')
          .map((email) => email.trim())
          .filter((email) => email.length > 0)

        for (const email of coInstructorEmails) {
          await addInstructorToClass(email, classId)
        }
      }
    } catch (error) {
      console.error('Error updating instructor class mappings:', error)
    }
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
  instructorEmail: string,
  classId: string,
): Promise<void> {
  const instructorClassesRef = doc(
    db,
    instructorClassesCollection,
    instructorEmail,
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
