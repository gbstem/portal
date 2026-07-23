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
  semesterDatesDocument,
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
    expect(semesterDatesDocument).toBe(currentSemester.toLowerCase())
    expect(substituteRequestsCollection).toBe('subRequests')
    expect(maxChildrenPerAccount).toBe(5)
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
