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

    // A co-instructor's uid is nowhere in `${ownerUid}-${n}---${m}`, so the id
    // match alone hid a request they had filed themselves - they could not see
    // it, edit it or cancel it.
    test('counts a request as yours when you are the one who asked', () => {
      const docs = [
        {
          id: 'owner-uid-1---1',
          subRequestStatus: SubRequestStatus.SubstituteNeeded,
          course: 'Python 1',
          requestedByUid: 'co-uid',
        },
        {
          id: 'owner-uid-1---2',
          subRequestStatus: SubRequestStatus.SubstituteNeeded,
          course: 'Python 1',
          requestedByUid: 'owner-uid',
        },
      ]

      const coInstructor = parseSubRequestDocs(docs, 'co-uid')
      expect(coInstructor.userSubRequests.map((one) => one.id)).toEqual([
        'owner-uid-1---1',
      ])
      // The owner still sees both: their own request by either route, and the
      // co-instructor's because the class id carries their uid.
      const owner = parseSubRequestDocs(docs, 'owner-uid')
      expect(owner.userSubRequests).toHaveLength(2)
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
    test('sends the uid, and drops only the caller-supplied address', () => {
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
      // subInstructorEmail is genuinely dead: the server sends the confirmation
      // to the caller's own verified session address.
      expect(payload).not.toHaveProperty('subInstructorEmail')
      // originalInstructorEmail stays until Phase 4, as the server's fallback
      // for a uid that names no Auth account.
      expect(payload.originalInstructorEmail).toBe('orig@example.com')
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
      // Parsed uids are a guess, so the stored address must still travel as
      // the server's fallback.
      expect(payload.originalInstructorEmail).toBe('orig@example.com')
    })

    test('carries whoever asked for the sub, so the server can copy them', () => {
      const base = {
        course: 'Python 1',
        classNumber: 3,
        dateOfClass: { seconds: 1779900600 },
        originalInstructorEmail: 'orig@example.com',
        originalInstructorUid: 'orig-uid-1',
      }

      expect(
        buildSubstituteApiPayload('Jane', {
          ...base,
          requestedByUid: 'co-uid',
        } as unknown as Data.SubRequest).requestedByUid,
      ).toBe('co-uid')
      // A request written before the field existed sends nothing rather than
      // an empty string, which would name no account.
      expect(
        buildSubstituteApiPayload('Jane', base as unknown as Data.SubRequest)
          .requestedByUid,
      ).toBeUndefined()
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
