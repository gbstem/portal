import semesterDatesJson from './semesterDates.json'

const suffix = 'Fall26'

export const currentSemester = suffix

export const semesterCollectionPath = (semesterId: string, name: string) =>
  `semesters/${semesterId}/${name}`

export const applicationsCollection = semesterCollectionPath(
  suffix,
  'applications',
)
export const classesCollection = semesterCollectionPath(suffix, 'classes')
export const decisionsCollection = semesterCollectionPath(suffix, 'decisions')
export const instructorFeedbackCollection = semesterCollectionPath(
  suffix,
  'instructorFeedback',
)
export const interviewCollection = semesterCollectionPath(
  suffix,
  'instructorInterviewTimes',
)
export const registrationsCollection = semesterCollectionPath(
  suffix,
  'registrations',
)
// The current semester's key dates (MM/DD/YY strings), edited by hand alongside `suffix`
// each semester rollover (copied from the admin repo's src/lib/data/semesterDates.json).
// No longer a Firestore document - see __tests__/collections.test.ts's format/year validation.
export const semesterDates: Data.SemesterDates = semesterDatesJson
export const studentFeedbackCollection = semesterCollectionPath(
  suffix,
  'classFeedback',
)
export const substituteRequestsCollection = 'subRequests'

export const maxChildrenPerAccount = 5

// Stamps a `semester` field onto a document being created/overwritten so it can be
// filtered on in the shared (cross-semester) Algolia index the admin site searches
// against. The portal only ever writes to the current semester (no past-semester
// browsing here, unlike admin), so this always stamps currentSemester.
export const withSemester = <T extends object>(
  values: T,
): T & { semester: string } => ({ ...values, semester: currentSemester })
