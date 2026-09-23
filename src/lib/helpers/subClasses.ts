import type {} from '../../data.d.ts'

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
 * Extracts non-null checked-off substitute requests.
 */
export function filterCheckedOffSubClasses(
  classesCheckedOff: any[],
): Data.SubRequest[] {
  return classesCheckedOff
    .filter((item: any) => item !== null && item !== undefined && item[0])
    .map((item: any) => item[0] as Data.SubRequest)
}
