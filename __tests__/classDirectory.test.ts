const mockDoc = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    doc: (...args: any[]) => mockDoc(...args),
  },
}))

jest.mock(
  '@sveltejs/kit',
  () => ({
    error: (status: number, message: any) => {
      const err: any = new Error(
        typeof message === 'string' ? message : JSON.stringify(message),
      )
      err.status = status
      err.message = message
      err.__isSvelteKitError = true
      return err
    },
  }),
  { virtual: true },
)

import {
  classesCollection,
  registrationsCollection,
} from '$lib/data/collections'
import {
  getAuthorizedClass,
  getStudentSnaps,
  isInstructorOfClass,
} from '$lib/server/classDirectory'

function mockFirestore(docs: Record<string, any>) {
  mockDoc.mockImplementation((path: string) => ({
    get: async () => ({
      exists: path in docs,
      data: () => docs[path],
    }),
  }))
}

const mockClassData: Data.Class = {
  course: 'Python 1',
  instructorEmail: 'owner@example.com',
  instructorUid: 'owner-uid',
  instructorFirstName: 'Ada',
  instructorLastName: 'Lovelace',
  otherInstructorUids: ['cohost-uid'],
  classCap: 12,
  students: ['student-1', 'student-2'],
  online: true,
} as any as Data.Class

describe('classDirectory', () => {
  beforeEach(() => {
    mockDoc.mockReset()
    mockFirestore({})
  })

  describe('isInstructorOfClass', () => {
    test('returns true for the primary instructor (owner)', () => {
      expect(
        isInstructorOfClass(mockClassData, {
          uid: 'owner-uid',
          role: 'instructor',
        }),
      ).toBe(true)
    })

    test('returns true for an accepted co-instructor', () => {
      expect(
        isInstructorOfClass(mockClassData, {
          uid: 'cohost-uid',
          role: 'instructor',
        }),
      ).toBe(true)
    })

    test('returns true for an administrator', () => {
      expect(
        isInstructorOfClass(mockClassData, { uid: 'admin-uid', role: 'admin' }),
      ).toBe(true)
    })

    test('returns false for an unrelated instructor', () => {
      expect(
        isInstructorOfClass(mockClassData, {
          uid: 'other-uid',
          role: 'instructor',
        }),
      ).toBe(false)
    })

    test('returns false for a student', () => {
      expect(
        isInstructorOfClass(mockClassData, {
          uid: 'student-1',
          role: 'student',
        }),
      ).toBe(false)
    })

    test('handles missing or non-array otherInstructorUids safely', () => {
      const classWithoutCoInstructors: Data.Class = {
        ...mockClassData,
        otherInstructorUids: undefined as any,
      }
      expect(
        isInstructorOfClass(classWithoutCoInstructors, {
          uid: 'owner-uid',
          role: 'instructor',
        }),
      ).toBe(true)
      expect(
        isInstructorOfClass(classWithoutCoInstructors, {
          uid: 'other-uid',
          role: 'instructor',
        }),
      ).toBe(false)
    })
  })

  describe('getAuthorizedClass', () => {
    test('returns class data when caller is the owner', async () => {
      mockFirestore({
        [`${classesCollection}/class-1`]: mockClassData,
      })

      const result = await getAuthorizedClass('class-1', {
        uid: 'owner-uid',
        role: 'instructor',
      })
      expect(result).toEqual(mockClassData)
    })

    test('returns class data when caller is a co-instructor', async () => {
      mockFirestore({
        [`${classesCollection}/class-1`]: mockClassData,
      })

      const result = await getAuthorizedClass('class-1', {
        uid: 'cohost-uid',
        role: 'instructor',
      })
      expect(result).toEqual(mockClassData)
    })

    test('returns class data when caller is an admin', async () => {
      mockFirestore({
        [`${classesCollection}/class-1`]: mockClassData,
      })

      const result = await getAuthorizedClass('class-1', {
        uid: 'admin-uid',
        role: 'admin',
      })
      expect(result).toEqual(mockClassData)
    })

    test('throws 404 when the class does not exist', async () => {
      mockFirestore({})

      await expect(
        getAuthorizedClass('nonexistent-class', {
          uid: 'owner-uid',
          role: 'instructor',
        }),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Class not found.',
      })
    })

    test('throws 403 when the caller is not authorized for the class', async () => {
      mockFirestore({
        [`${classesCollection}/class-1`]: mockClassData,
      })

      await expect(
        getAuthorizedClass('class-1', {
          uid: 'stranger-uid',
          role: 'instructor',
        }),
      ).rejects.toMatchObject({
        status: 403,
        message: 'You are not an instructor of that class.',
      })
    })
  })

  describe('getStudentSnaps', () => {
    test('returns document snapshots for the requested student UIDs', async () => {
      const student1Data = {
        personal: {
          studentFirstName: 'Alice',
          studentLastName: 'Smith',
          email: 'alice@example.com',
        },
      }
      const student2Data = {
        personal: {
          studentFirstName: 'Bob',
          studentLastName: 'Jones',
          email: 'bob@example.com',
        },
      }
      mockFirestore({
        [`${registrationsCollection}/student-1`]: student1Data,
        [`${registrationsCollection}/student-2`]: student2Data,
      })

      const snaps = await getStudentSnaps(['student-1', 'student-2'])
      expect(snaps).toHaveLength(2)
      expect(snaps[0].exists).toBe(true)
      expect(snaps[0].data()).toEqual(student1Data)
      expect(snaps[1].exists).toBe(true)
      expect(snaps[1].data()).toEqual(student2Data)
      expect(mockDoc).toHaveBeenCalledWith(
        `${registrationsCollection}/student-1`,
      )
      expect(mockDoc).toHaveBeenCalledWith(
        `${registrationsCollection}/student-2`,
      )
    })

    test('returns non-existent snapshot when student registration is missing', async () => {
      mockFirestore({})

      const snaps = await getStudentSnaps(['missing-student'])
      expect(snaps).toHaveLength(1)
      expect(snaps[0].exists).toBe(false)
      expect(snaps[0].data()).toBeUndefined()
      expect(mockDoc).toHaveBeenCalledWith(
        `${registrationsCollection}/missing-student`,
      )
    })

    test('returns empty array when student UIDs list is empty', async () => {
      const snaps = await getStudentSnaps([])
      expect(snaps).toEqual([])
      expect(mockDoc).not.toHaveBeenCalled()
    })
  })
})
