import {
  classesCollection,
  registrationsCollection,
} from '$lib/data/collections'
import { adminDb } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'
import type { DocumentSnapshot } from 'firebase-admin/firestore'

export interface ClassCaller {
  uid: string
  role?: string
}

/**
 * Checks whether a user is authorized as an instructor of the class:
 * either the primary instructor (owner), an accepted co-instructor, or an administrator.
 */
export function isInstructorOfClass(
  classData: Data.Class,
  user: ClassCaller,
): boolean {
  const isOwner = classData.instructorUid === user.uid
  const isCoInstructor =
    Array.isArray(classData.otherInstructorUids) &&
    classData.otherInstructorUids.includes(user.uid)
  const isAdmin = user.role === 'admin'

  return isOwner || isCoInstructor || isAdmin
}

/**
 * Loads a class document by classId and verifies that the calling user is
 * authorized to access it (primary instructor, co-instructor, or administrator).
 *
 * Throws 404 if the class does not exist.
 * Throws 403 if the user is not an instructor of the class or an admin.
 * Returns the class data on success.
 */
export async function getAuthorizedClass(
  classId: string,
  user: ClassCaller,
): Promise<Data.Class> {
  const snap = await adminDb.doc(`${classesCollection}/${classId}`).get()
  if (!snap.exists) {
    throw error(404, 'Class not found.')
  }
  const classData = snap.data() as Data.Class

  if (!isInstructorOfClass(classData, user)) {
    throw error(403, 'You are not an instructor of that class.')
  }

  return classData
}

/**
 * Loads registration document snapshots for the given list of student UIDs.
 */
export async function getStudentSnaps(
  studentUids: string[],
): Promise<DocumentSnapshot[]> {
  return Promise.all(
    studentUids.map((uid) =>
      adminDb.doc(`${registrationsCollection}/${uid}`).get(),
    ),
  )
}
