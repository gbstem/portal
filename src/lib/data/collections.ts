const suffix = 'Spring26'

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
export const semesterDatesDocument = suffix.toLowerCase()
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
