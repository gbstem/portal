import { db } from '$lib/client/firebase'
import type Student from '$lib/components/types/Student'
import {
  classesCollection,
  registrationsCollection,
  substituteRequestsCollection,
} from '$lib/data/collections'
import {
  buildSubRequestPayload,
  transformStudentDocData,
} from '$lib/helpers/classSchedule'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

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
}
