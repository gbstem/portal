import {
  classesCollection,
  registrationsCollection,
} from '$lib/data/collections'
import { isGradeEligible } from '$lib/helpers/classesPage'
import { adminDb } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'

/** The most classes one student may be enrolled in at once. */
export const MAX_CLASSES_PER_STUDENT = 2

export interface EnrollmentCaller {
  uid: string
}

/** The class and registration as an enrollment left them. */
export interface Enrollment {
  classData: Data.Class
  registration: Data.Registration
}

/**
 * Whether `registrationId` names one of the parent account `uid`'s students.
 * Registrations are keyed `${parentUid}` or `${parentUid}-${n}`; this is the
 * same test firestore.rules makes in isStudentUserOrTheirChild.
 */
export function isOwnRegistration(
  uid: string,
  registrationId: string,
): boolean {
  if (registrationId === uid) return true
  const prefix = `${uid}-`
  return (
    registrationId.startsWith(prefix) &&
    /^\d+$/.test(registrationId.slice(prefix.length))
  )
}

function requireOwnRegistration(uid: string, studentUid: string) {
  if (!isOwnRegistration(uid, studentUid)) {
    throw error(403, 'You can only enroll your own students.')
  }
}

function refs(classId: string, studentUid: string) {
  return {
    classRef: adminDb.doc(`${classesCollection}/${classId}`),
    registrationRef: adminDb.doc(`${registrationsCollection}/${studentUid}`),
  }
}

/**
 * Enrolls `studentUid` in `classId`: adds them to the class's `students` and
 * the class to their registration's `classes`, in one transaction.
 *
 * Both halves used to be separate client writes, and firestore.rules refuses
 * the class half to every parent, so under those rules an enrollment from the
 * classes page reached the registration and never the class - while the
 * roster, the spots remaining, the capacity check and every reminder read the
 * class half. Writing both here is
 * what keeps the two from disagreeing, and the checks the page used to make
 * in the browser - capacity, the two-class limit, grade eligibility - are
 * made here so they hold for any caller.
 *
 * Refused when the student isn't the caller's, their registration isn't
 * submitted, the class is gone, they are already enrolled, or a check fails.
 * A half-finished enrollment - one of the two documents already listing the
 * other - is completed rather than refused, and a seat the class already
 * gives the student doesn't count against its capacity.
 */
export async function enrollStudent(
  caller: EnrollmentCaller,
  classId: string,
  studentUid: string,
): Promise<Enrollment> {
  requireOwnRegistration(caller.uid, studentUid)
  const { classRef, registrationRef } = refs(classId, studentUid)

  return adminDb.runTransaction(async (transaction) => {
    const classSnap = await transaction.get(classRef)
    const registrationSnap = await transaction.get(registrationRef)

    const registration = registrationSnap.data() as
      Data.Registration | undefined
    if (!registrationSnap.exists || !registration?.meta?.submitted) {
      throw error(
        400,
        "Submit this student's registration before enrolling them in a class.",
      )
    }
    if (!classSnap.exists) {
      throw error(404, 'That class no longer exists.')
    }
    const classData = classSnap.data() as Data.Class

    const students = classData.students ?? []
    const classIds = registration.classes ?? []
    const onRoster = students.includes(studentUid)
    const onRegistration = classIds.includes(classId)

    if (onRoster && onRegistration) {
      throw error(409, 'That student is already enrolled in that class.')
    }
    if (!onRoster && students.length >= (classData.classCap ?? 0)) {
      throw error(409, 'That class is full.')
    }
    if (!onRegistration && classIds.length >= MAX_CLASSES_PER_STUDENT) {
      throw error(
        400,
        `Each student may only enroll in a maximum of ${MAX_CLASSES_PER_STUDENT} classes.`,
      )
    }
    const eligibility = isGradeEligible(
      classData.course,
      registration.academic?.grade ?? '',
      Boolean(registration.agreements?.bypassAgeLimits),
    )
    if (!eligibility.eligible) {
      throw error(
        400,
        `Students must be in grade ${eligibility.requiredGrade} or higher to enroll in this class.`,
      )
    }

    const enrolledStudents = onRoster ? students : [...students, studentUid]
    const enrolledClassIds = onRegistration ? classIds : [...classIds, classId]
    transaction.update(classRef, { students: enrolledStudents })
    transaction.update(registrationRef, {
      classes: enrolledClassIds,
      enrolled: true,
    })

    return {
      classData: { ...classData, students: enrolledStudents },
      registration: {
        ...registration,
        classes: enrolledClassIds,
        enrolled: true,
      },
    }
  })
}

/**
 * Takes `studentUid` out of `classId`, from both the class's `students` and
 * their registration's `classes`, in one transaction. `enrolled` then says
 * whether any class is left.
 *
 * Idempotent: whichever half still lists the other is cleared, so a
 * half-finished enrollment can always be undone. Refused only when the
 * student isn't the caller's or has no registration.
 */
export async function unenrollStudent(
  caller: EnrollmentCaller,
  classId: string,
  studentUid: string,
): Promise<void> {
  requireOwnRegistration(caller.uid, studentUid)
  const { classRef, registrationRef } = refs(classId, studentUid)

  await adminDb.runTransaction(async (transaction) => {
    const classSnap = await transaction.get(classRef)
    const registrationSnap = await transaction.get(registrationRef)

    if (!registrationSnap.exists) {
      throw error(404, 'That student has no registration.')
    }
    const registration = registrationSnap.data() as Data.Registration

    if (classSnap.exists) {
      const students = (classSnap.data() as Data.Class).students ?? []
      if (students.includes(studentUid)) {
        transaction.update(classRef, {
          students: students.filter((uid) => uid !== studentUid),
        })
      }
    }

    const remaining = (registration.classes ?? []).filter(
      (id) => id !== classId,
    )
    transaction.update(registrationRef, {
      classes: remaining,
      enrolled: remaining.length > 0,
    })
  })
}
