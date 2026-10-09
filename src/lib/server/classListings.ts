import { toDateOrNull } from '#lib/shared/timestamps.js'
import { classesCollection } from '#lib/data/collections.js'
import { isOwnRegistration } from '#lib/data/docIds.js'
import {
  parseClassInfoDoc,
  sortClassesBySpotsRemaining,
  type ClassInfo,
} from '#lib/helpers/classesPage.js'
import { adminDb } from '#lib/server/firebase.js'
import { error } from '@sveltejs/kit'

// firestore.rules lets only admins and reviewers read a class directly: a
// class document carries its online meeting link and the registration ids on
// its roster, and a rule can't hide single fields. Portal pages get classes
// from here instead, cut down to what the caller may see.

/** Whether any student on `students` is one of parent account `uid`'s. */
function hasOwnStudent(uid: string, students: unknown): boolean {
  return (
    Array.isArray(students) &&
    students.some((id) => typeof id === 'string' && isOwnRegistration(uid, id))
  )
}

/**
 * Every class this semester, as the /classes page lists them: course, grades,
 * schedule, instructor name and spots remaining. No roster, and a meeting
 * link only for a class one of the caller's own students is enrolled in -
 * the only card that shows it.
 */
export async function fetchClassListings(caller: {
  uid: string
  role: Data.Role
}): Promise<ClassInfo[]> {
  const snap = await adminDb.collection(classesCollection).get()
  return sortClassesBySpotsRemaining(
    snap.docs.map((classDoc) => {
      const data = classDoc.data()
      const enrolled =
        caller.role === 'student' && hasOwnStudent(caller.uid, data.students)
      return {
        ...parseClassInfoDoc(classDoc.id, data),
        meetingLink: enrolled ? (data.meetingLink ?? '') : '',
      }
    }),
  )
}

/** One of a student's classes, as their schedule and feedback form use it. */
export interface StudentClass {
  id: string
  course: string
  instructorFirstName: string
  instructorLastName: string
  /** ISO strings. */
  meetingTimes: string[]
  meetingLink: string
}

/**
 * The classes `studentUid` is on the roster of, for the parent account
 * `parentUid`, which must be theirs.
 */
export async function fetchStudentClasses(
  parentUid: string,
  studentUid: string,
): Promise<StudentClass[]> {
  if (!isOwnRegistration(parentUid, studentUid)) {
    throw error(403, 'You can only view your own students’ classes.')
  }
  const snap = await adminDb
    .collection(classesCollection)
    .where('students', 'array-contains', studentUid)
    .get()
  return snap.docs.map((classDoc) => {
    const data = classDoc.data()
    return {
      id: classDoc.id,
      course: data.course ?? '',
      instructorFirstName: data.instructorFirstName ?? '',
      instructorLastName: data.instructorLastName ?? '',
      meetingTimes: (data.meetingTimes ?? [])
        .map((time: unknown) => toDateOrNull(time)?.toISOString())
        .filter((time: string | undefined): time is string => Boolean(time)),
      meetingLink: data.meetingLink ?? '',
    }
  })
}
