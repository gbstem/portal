import type {} from '../../data.d.ts'
import { SubRequestStatus } from '../components/helpers/SubRequestStatus'
import { formatDate, timestampToDate } from '$lib/utils'
import type Student from '../components/types/Student'

export type SubClassesDataResult = {
  userSubRequests: Data.SubRequest[]
  classesMissingSubs: Data.SubRequest[]
  userSubClasses: Data.SubRequest[]
}

/**
 * Categorizes substitute request documents for a user.
 */
export function parseSubRequestDocs(
  docs: any[],
  userId: string,
): SubClassesDataResult {
  const userSubRequests: Data.SubRequest[] = []
  const classesMissingSubs: Data.SubRequest[] = []
  const userSubClasses: Data.SubRequest[] = []

  docs.forEach((docSnap) => {
    const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap
    const docId = docSnap.id ?? data.id ?? ''
    if (!data) return

    const classInfo = { ...data, id: docId } as Data.SubRequest

    if (docId.includes(userId)) {
      userSubRequests.push(classInfo)
    }

    if (classInfo.subRequestStatus === SubRequestStatus.SubstituteNeeded) {
      classesMissingSubs.push(classInfo)
    } else if (
      (classInfo.subRequestStatus === SubRequestStatus.SubstituteFound ||
        classInfo.subRequestStatus ===
          SubRequestStatus.SubstituteFeedbackNeeded) &&
      classInfo.subInstructorId === userId
    ) {
      userSubClasses.push(classInfo)
    }
  })

  return {
    userSubRequests,
    classesMissingSubs,
    userSubClasses,
  }
}

/**
 * Extracts non-null checked-off substitute requests.
 */
export function filterCheckedOffSubClasses(
  classesCheckedOff: any[],
): Data.SubRequest[] {
  return classesCheckedOff
    .filter((item: any) => item !== null && item !== undefined && item[0])
    .map((item: any) => item[0] as Data.SubRequest)
}

/**
 * Constructs request payload for /api/substitute endpoint.
 */
export function buildSubstituteApiPayload(
  userFirstName: string,
  userEmail: string,
  classToSub: Data.SubRequest,
) {
  return {
    firstName: userFirstName,
    subInstructorEmail: userEmail,
    course: classToSub.course,
    classNumber: classToSub.classNumber,
    date: formatDate(timestampToDate(classToSub.dateOfClass)),
    originalInstructorEmail: classToSub.originalInstructorEmail,
  }
}

/**
 * Normalizes raw registration document data into a Student object.
 */
export function parseSubStudentDoc(data: any): Student | null {
  if (!data || !data.personal) return null

  return {
    name: `${data.personal.studentFirstName ?? ''} ${data.personal.studentLastName ?? ''}`.trim(),
    email: data.personal.email ?? '',
    secondaryEmail: data.personal.secondaryEmail ?? '',
    phone: data.personal.phoneNumber ?? '',
    grade: data.academic?.grade ?? 0,
    school: data.academic?.school ?? '',
  }
}
