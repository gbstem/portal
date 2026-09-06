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
 * The document id a substitute request lives at: the class it belongs to and
 * the session number within that class.
 *
 * Every read and write of a sub request goes through this pair, because the
 * two halves of the feature disagreed about the id for as long as both have
 * existed. Requests are created at `${classId}---${classNumber}` but were
 * edited and deleted at `${signedInUid}---${classNumber}`, which is a
 * different document for every real class - a class id is `${ownerUid}-${n}`,
 * so the uid alone names nothing. Editing wrote a phantom request to that
 * path and left the real one untouched; deleting removed a document that was
 * never there and reported success.
 */
export function subRequestDocId(classId: string, classNumber: number): string {
  return `${classId}---${classNumber}`
}

/**
 * The class a sub request belongs to, recovered from its document id. The id
 * is the only place it is recorded: the request's own `id` *field* holds the
 * class id at creation, but nothing reads it - `parseSubRequestDocs`
 * overwrites it with the document id on the way in.
 */
export function subRequestClassId(subRequestId: string): string {
  return subRequestId.split('---')[0]
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

    // The id match is how an owner finds their own requests: a class id is
    // `${ownerUid}-${n}`, so the request id contains their uid. A
    // co-instructor's uid appears nowhere in it, which left them unable to
    // see - or cancel - a request they filed themselves; `requestedByUid`
    // says who asked regardless of whose class it is.
    if (docId.includes(userId) || classInfo.requestedByUid === userId) {
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
  classToSub: Data.SubRequest,
) {
  // New sub requests will have an originalInstructorUid, but legacy ones may not, and in that case
  // we parse it out of the ${instructorUid}-${classSequenceNumber}---${subRequestClassNumber} format document ID.
  const originalInstructorUid =
    classToSub.originalInstructorUid ||
    (classToSub.id
      ? classToSub.id.replace(/---.*$/, '').replace(/-\d+$/, '')
      : '')
  // No subInstructorEmail: the server sends the confirmation to the caller's
  // own verified session address, so that one is genuinely dead.
  //
  // originalInstructorEmail stays until Phase 4. The uid above is a guess
  // whenever it comes from parsing the document id, and a sub request whose id
  // does not follow the `${uid}-${n}---${m}` scheme yields a string naming no
  // Auth account - only the server can tell, so it gets both.
  return {
    firstName: userFirstName,
    course: classToSub.course,
    classNumber: classToSub.classNumber,
    date: formatDate(timestampToDate(classToSub.dateOfClass)),
    originalInstructorUid: originalInstructorUid || undefined,
    originalInstructorEmail: classToSub.originalInstructorEmail,
    // Whoever asked for the sub, so the confirmation copies them as well as
    // the class's instructor of record. The two are the same person unless a
    // co-instructor filed the request, and absent on requests written before
    // the field existed.
    requestedByUid: classToSub.requestedByUid || undefined,
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
