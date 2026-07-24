import {
  applicationsCollection,
  classesCollection,
  currentSemester,
  decisionsCollection,
  instructorFeedbackCollection,
  interviewCollection,
  maxChildrenPerAccount,
  registrationsCollection,
  semesterCollectionPath,
  semesterDates,
  studentFeedbackCollection,
  substituteRequestsCollection,
  withSemester,
} from '../src/lib/data/collections'

describe('collections.ts', () => {
  // Guards the assumption the rest of this file's assertions are built on: that
  // currentSemester is a `{Spring,Fall}{2-digit year}` id (e.g. "Spring26"), not some other
  // format. Assertions below are parameterized off currentSemester (rather than hardcoding
  // e.g. "Spring26") so they don't need editing every time a new semester rolls in — this
  // check is what keeps that parameterization honest instead of silently matching anything.
  it('currentSemester matches the expected (Spring|Fall)\\d\\d format', () => {
    expect(currentSemester).toMatch(/^(Spring|Fall)\d\d$/)
  })

  it('exports semester-scoped subcollection paths for the current semester', () => {
    expect(applicationsCollection).toBe(
      `semesters/${currentSemester}/applications`,
    )
    expect(classesCollection).toBe(`semesters/${currentSemester}/classes`)
    expect(decisionsCollection).toBe(`semesters/${currentSemester}/decisions`)
    expect(instructorFeedbackCollection).toBe(
      `semesters/${currentSemester}/instructorFeedback`,
    )
    expect(interviewCollection).toBe(
      `semesters/${currentSemester}/instructorInterviewTimes`,
    )
    expect(registrationsCollection).toBe(
      `semesters/${currentSemester}/registrations`,
    )
    expect(studentFeedbackCollection).toBe(
      `semesters/${currentSemester}/classFeedback`,
    )
  })

  it('leaves non-semesterized collections and constants unchanged', () => {
    expect(substituteRequestsCollection).toBe('subRequests')
    expect(maxChildrenPerAccount).toBe(5)
  })

  // semesterDates.json is hand-edited each semester rollover (copied from the admin repo's
  // copy - no more Firestore document, see admin/README.md's "Adding a New Semester"), so
  // it's worth validating its shape here rather than only discovering a typo/wrong-year/
  // out-of-sync-with-admin mistake at runtime.
  describe('semesterDates', () => {
    const expectedYear = currentSemester.match(/\d\d$/)?.[0] as string

    it('has exactly the expected fields', () => {
      expect(Object.keys(semesterDates).sort()).toEqual(
        [
          'classesEnd',
          'classesStart',
          'instructorOrientation',
          'newInstructorAppsDue',
          'newInstructorAppsOpen',
          'parentOrientation',
          'registrationsDue',
          'registrationsOpen',
          'returningInstructorAppsDue',
          'returningInstructorAppsOpen',
          'studentOrientation',
        ].sort(),
      )
    })

    // Object.entries() on a plain (non-index-signature) object type falls back to a
    // less-precise overload that types values as `unknown` - cast once here rather than at
    // every destructured usage below.
    const semesterDateEntries = Object.entries(semesterDates) as Array<
      [string, string]
    >

    it.each(semesterDateEntries)(
      '%s is a valid MM/DD/YY date whose year matches currentSemester',
      (_field, value) => {
        expect(value).toMatch(/^\d{2}\/\d{2}\/\d{2}$/)
        expect(new Date(value).toString()).not.toBe('Invalid Date')
        expect(value.slice(-2)).toBe(expectedYear)
      },
    )
  })

  describe('semesterCollectionPath', () => {
    it('builds a semesters/{semesterId}/{name} path', () => {
      expect(semesterCollectionPath('Fall25', 'registrations')).toBe(
        'semesters/Fall25/registrations',
      )
    })
  })

  describe('withSemester', () => {
    it('stamps the current semester', () => {
      expect(withSemester({ foo: 'bar' })).toEqual({
        foo: 'bar',
        semester: currentSemester,
      })
    })

    it('does not mutate the original object', () => {
      const original = { foo: 'bar' }
      withSemester(original)
      expect(original).toEqual({ foo: 'bar' })
    })
  })
})
