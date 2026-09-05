import type {} from '../src/data.d.ts'
import {
  parseSubRequestDocs,
  filterCheckedOffSubClasses,
  buildSubstituteApiPayload,
  parseSubStudentDoc,
} from '$lib/helpers/subClasses'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'

describe('SubClasses Helpers', () => {
  describe('parseSubRequestDocs', () => {
    test('categorizes substitute request documents properly', () => {
      const docs = [
        {
          id: 'user123---1',
          subRequestStatus: SubRequestStatus.SubstituteNeeded,
          course: 'Python 1',
        },
        {
          id: 'other456---2',
          subRequestStatus: SubRequestStatus.SubstituteFound,
          subInstructorId: 'user123',
          course: 'Scratch',
        },
      ]

      const result = parseSubRequestDocs(docs, 'user123')
      expect(result.userSubRequests.length).toBe(1)
      expect(result.classesMissingSubs.length).toBe(1)
      expect(result.userSubClasses.length).toBe(1)
    })
  })

  describe('filterCheckedOffSubClasses', () => {
    test('filters out nulls and extracts sub request objects', () => {
      const mockReq = { id: 'req-1', course: 'Math' } as Data.SubRequest
      const checkedOff = [null, [mockReq], null]

      const filtered = filterCheckedOffSubClasses(checkedOff)
      expect(filtered).toEqual([mockReq])
    })
  })

  describe('buildSubstituteApiPayload', () => {
    test('sends the uid only, with neither instructor address', () => {
      const subReq = {
        course: 'Python 1',
        classNumber: 3,
        dateOfClass: { seconds: 1779900600 },
        originalInstructorEmail: 'orig@example.com',
        originalInstructorUid: 'orig-uid-1',
      } as unknown as Data.SubRequest

      const payload = buildSubstituteApiPayload('Jane', subReq)
      expect(payload.firstName).toBe('Jane')
      expect(payload.course).toBe('Python 1')
      expect(payload.classNumber).toBe(3)
      expect(payload.originalInstructorUid).toBe('orig-uid-1')
      // The server sends the confirmation to the caller's own verified session
      // address and resolves the original instructor's from Auth, so neither
      // recipient can be dictated from the browser.
      expect(payload).not.toHaveProperty('subInstructorEmail')
      expect(payload).not.toHaveProperty('originalInstructorEmail')
    })

    test('falls back to parsing originalInstructorUid from sub request doc ID', () => {
      const subReq = {
        id: 'instructorUid123-1---3',
        course: 'Python 1',
        classNumber: 3,
        dateOfClass: { seconds: 1779900600 },
        originalInstructorEmail: 'orig@example.com',
      } as unknown as Data.SubRequest

      const payload = buildSubstituteApiPayload('Jane', subReq)
      expect(payload.originalInstructorUid).toBe('instructorUid123')
      expect(payload).not.toHaveProperty('originalInstructorEmail')
    })
  })

  describe('parseSubStudentDoc', () => {
    test('extracts student profile details safely', () => {
      const raw = {
        personal: {
          studentFirstName: 'Timmy',
          studentLastName: 'Turner',
          email: 'timmy@example.com',
          secondaryEmail: 'parent@example.com',
          phoneNumber: '555-0000',
        },
        academic: {
          grade: 5,
          school: 'Dimmsdale Elementary',
        },
      }

      const student = parseSubStudentDoc(raw)
      expect(student).toEqual({
        name: 'Timmy Turner',
        email: 'timmy@example.com',
        secondaryEmail: 'parent@example.com',
        phone: '555-0000',
        grade: 5,
        school: 'Dimmsdale Elementary',
      })
    })

    test('returns null when input is null or missing personal section', () => {
      expect(parseSubStudentDoc(null)).toBeNull()
    })
  })
})
