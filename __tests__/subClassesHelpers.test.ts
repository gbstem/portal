import type {} from '../src/data.d.ts'
import {
  filterCheckedOffSubClasses,
  parseSubStudentDoc,
  subRequestClassId,
  subRequestDocId,
} from '$lib/helpers/subClasses'

describe('SubClasses Helpers', () => {
  describe('sub request document ids', () => {
    test('round-trips a class id through the document id', () => {
      const classId = 'owner-uid-1'
      const docId = subRequestDocId(classId, 3)

      expect(docId).toBe('owner-uid-1---3')
      expect(subRequestClassId(docId)).toBe(classId)
    })

    test('recovers the class from ids that already exist', () => {
      // A seeded or hand-written class id need not follow `${uid}-${n}`...
      expect(subRequestClassId('class-python1---1')).toBe('class-python1')
      // ...and a uid contains single dashes, which is why the separator is
      // three of them and why splitting on the first dash would be wrong.
      expect(subRequestClassId('instructor-demo-uid-1---12')).toBe(
        'instructor-demo-uid-1',
      )
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
