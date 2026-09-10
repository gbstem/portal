import { db } from '$lib/client/firebase'
import {
  classesCollection,
  instructorFeedbackCollection,
  registrationsCollection,
  studentFeedbackCollection,
  substituteRequestsCollection,
  withSemester,
} from '$lib/data/collections'
import type { CoInstructor } from '$lib/helpers/classDetailsForm'
import {
  parseClassInfoDoc,
  sortClassesBySpotsRemaining,
  type ClassInfo,
} from '$lib/helpers/classesPage'
import { buildSubRequestPayload } from '$lib/helpers/classSchedule'
import { subRequestDocId } from '$lib/helpers/subClasses'
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
import type {
  ClassDetailsRequestBody,
  ClassDetailsResponse,
} from '../../routes/api/classDetails/+server'

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

export interface RosterStudent {
  uid: string
  name: string
  email: string
  secondaryEmail: string
  phone: string
  grade: string | number
  school: string
}

/**
 * Service providing Data Access Layer for Class Schedule management.
 */
export const classService = {
  /**
   * Fetches the sanitized student roster for an authorized class via the backend API.
   * Enforces server-side authorization and never exposes sensitive demographics.
   */
  async fetchClassRoster(
    classId: string,
    subRequestId?: string,
  ): Promise<RosterStudent[]> {
    const params = new URLSearchParams({ classId })
    if (subRequestId) {
      params.set('subRequestId', subRequestId)
    }
    const res = await fetch(`/api/classRoster?${params.toString()}`)
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(
        errData.message || `Failed to fetch class roster: ${res.statusText}`,
      )
    }
    const data = await res.json()
    return data.students || []
  },

  /**
   * Fetches student display names for an authorized class via the backend API.
   */
  async fetchStudentNamesForClass(
    classId: string,
    subRequestId?: string,
  ): Promise<string[]> {
    const roster = await this.fetchClassRoster(classId, subRequestId)
    return roster.map((s) => s.name)
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
    requestedByUid?: string,
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
      requestedByUid,
    })

    const docRef = doc(
      db,
      substituteRequestsCollection,
      subRequestDocId(classId, subRequestClassNumber),
    )
    await setDoc(docRef, subRequest)
  },

  /**
   * Creates or updates a class from ClassDetailsForm. Ownership, co-instructor
   * eligibility and which dashboards list the class are decided server-side;
   * see /api/classDetails. Throws with the server's message on refusal.
   */
  async saveClassDetails(body: ClassDetailsRequestBody): Promise<void> {
    const res = await fetch('/api/classDetails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(
        errData?.message || 'Could not save class details. Please try again.',
      )
    }
  },

  /**
   * Gets every class the signed-in instructor can reach: the ones they own
   * and the ones shared with them as a co-instructor.
   * Returns an empty object (rather than throwing) on fetch failure, since
   * callers treat "no accessible classes" and "fetch failed" the same way.
   */
  async fetchInstructorClasses(): Promise<{ [classId: string]: Data.Class }> {
    try {
      const res = await fetch('/api/classDetails')
      if (!res.ok) {
        throw new Error(`Failed to load classes (${res.status})`)
      }
      const { classes } = (await res.json()) as ClassDetailsResponse
      return Object.fromEntries(
        Object.entries(classes).map(([classId, classData]) => [
          classId,
          {
            ...classData,
            meetingTimes: classData.meetingTimes.map((time) => new Date(time)),
            completedClassDates: classData.completedClassDates.map(
              (time) => new Date(time),
            ),
          },
        ]),
      )
    } catch (error) {
      console.error('Error fetching instructor classes:', error)
      return {}
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
   * Records a class instructor's feedback for one session: saves the feedback
   * document and marks the session complete on the class.
   *
   * Only for an instructor of the class - a substitute's feedback goes through
   * /api/substituteFeedback instead, because the class update below is a write
   * firestore.rules refuses them. This used to close out a substitute request
   * as well, which meant the sub path ran entirely here and failed halfway
   * through: the feedback saved, the class update was denied, and the request
   * was left asking for feedback forever.
   */
  async submitInstructorFeedback(
    classId: string,
    feedback: InstructorFeedbackSubmission,
    feedbackCompleted: boolean[],
    classStatuses: string[],
  ): Promise<void> {
    await setDoc(
      doc(db, instructorFeedbackCollection, `${classId}-${Date.now()}`),
      withSemester(feedback),
    )
    await updateDoc(doc(db, classesCollection, classId), {
      feedbackCompleted,
      classStatuses,
    })
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
