import type {} from '../../data.d.ts'
import type { EnrollRequestBody } from '../../routes/api/enroll/+server'

export type ClassInfo = {
  id: string
  className: string
  classDays: string[]
  classTimes: string[]
  course: string
  instructorFirstName: string
  instructorLastName: string
  instructorEmail: string
  instructorUid?: string
  spotsRemaining: number
  meetingLink: string
  gradeRecommendation: string
  online: boolean
}

export const courseToMinGrade: Record<string, number> = {
  'Environmental Science A': 5,
  'Environmental Science B': 5,
  'Python 1': 3,
  'Web Development': 5,
  'Python 2': 5,
  'Mathematics 2a': 1,
  'Mathematics 2b': 1,
  'Mathematics 3a': 3,
  'Mathematics 3b': 3,
  'Mathematics 4a': 5,
  'Mathematics 4b': 5,
  'Mathematics 5a': 6,
  'Mathematics 5b': 6,
  'Engineering 1': 2,
  'Engineering 2': 4,
  'Engineering 3': 5,
  'Lego Robotics Competition': 5,
}

/**
 * Parses raw Firestore document data into a ClassInfo object.
 */
export function parseClassInfoDoc(id: string, data: any): ClassInfo {
  const classDays: string[] = []
  const classTimes: string[] = []

  for (let i = 1; i <= 2; i++) {
    if (data[`classDay${i}`] && data[`classTime${i}`]) {
      classDays.push(data[`classDay${i}`])
      classTimes.push(data[`classTime${i}`])
    }
  }

  const spotsRemaining = data.students
    ? data.classCap - data.students.length
    : data.classCap

  return {
    id,
    className: data.className ?? '',
    classDays,
    classTimes,
    course: data.course ?? '',
    instructorFirstName: data.instructorFirstName ?? '',
    instructorLastName: data.instructorLastName ?? '',
    instructorEmail: data.instructorEmail ?? '',
    // New class documents will have a uid, but legacy ones may not, and in that case
    // we can parse it out of the ${instructorUid}-${classSequenceNumber} format document ID.
    instructorUid:
      data.instructorUid ??
      (id.includes('-') ? id.replace(/-\d+$/, '') : undefined),
    spotsRemaining: spotsRemaining ?? 0,
    meetingLink: data.meetingLink ?? '',
    gradeRecommendation: data.gradeRecommendation ?? '',
    online: Boolean(data.online),
  }
}

/**
 * Sorts classes descending by spots remaining.
 */
export function sortClassesBySpotsRemaining(
  classesList: ClassInfo[],
): ClassInfo[] {
  return [...classesList].sort((a, b) => b.spotsRemaining - a.spotsRemaining)
}

/**
 * Checks whether a student's grade satisfies minimum course grade requirements.
 */
export function isGradeEligible(
  courseName: string,
  studentGrade: string,
  ageBypassEnabled: boolean = false,
): { eligible: boolean; requiredGrade?: number } {
  if (ageBypassEnabled) {
    return { eligible: true }
  }

  const minGrade = courseToMinGrade[courseName]
  if (minGrade === undefined) {
    return { eligible: true }
  }

  if (studentGrade === 'K' || parseInt(studentGrade, 10) < minGrade) {
    return { eligible: false, requiredGrade: minGrade }
  }

  return { eligible: true }
}

/**
 * Constructs request payload for /api/enroll endpoint in portal.
 */
export function buildPortalEnrollApiPayload(
  userName: string,
  classDetails: ClassInfo,
  studentName: string,
): EnrollRequestBody {
  return {
    firstName: userName,
    instructor: classDetails.instructorFirstName,
    // Uid only, with no email fallback: parseClassInfoDoc always resolves an
    // instructorUid, from the document field or from the `${uid}-${n}` class id,
    // and portal only ever reads the current semester - where every class was
    // created under that id scheme.
    instructorUid: classDetails.instructorUid || undefined,
    classTimes: classDetails.classTimes,
    classDays: classDetails.classDays,
    course: classDetails.course,
    meetingLink: classDetails.meetingLink,
    online: classDetails.online,
    studentName,
  }
}
