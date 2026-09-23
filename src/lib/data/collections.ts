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
// Applicants' requests for an interview time none of the offered slots
// covers, keyed `${uid}-${date}`. Not semester-scoped.
export const interviewTimeRequestsCollection = 'interviewTimeRequests'
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
// `semesterDates`, blanked to empty strings - the default a component's
// `semesterDates` prop falls back to before its `+page.server.ts` load
// resolves (see ApplyForm.svelte/RegistrationForm.svelte). Derived from
// `semesterDates` itself so adding, renaming, or removing a field there
// never needs a matching manual edit in every form that renders one - a
// hand-maintained duplicate of this list is exactly what let a form's
// default silently drift out of step with a changed field, caught only by
// Cypress rather than at build or test time.
export const emptySemesterDates: Data.SemesterDates = Object.fromEntries(
  Object.keys(semesterDates).map((field) => [field, '']),
) as Data.SemesterDates
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
