import type {} from '../../data.d.ts'
import type Student from '../components/types/Student'

/** A session on the signup list: only what the list shows. */
export type OpenSubRequestSummary = Pick<
  Data.SubRequest,
  'id' | 'course' | 'classNumber' | 'dateOfClass'
>

export type SubClassesDataResult = {
  userSubRequests: Data.SubRequest[]
  classesMissingSubs: OpenSubRequestSummary[]
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
 * class id at creation, but nothing reads it - substituteService overwrites
 * it with the document id on the way in.
 */
export function subRequestClassId(subRequestId: string): string {
  return subRequestId.split('---')[0]
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
