import { classService } from '$lib/services/classService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  arrayUnion: jest.fn((val) => val),
  arrayRemove: jest.fn((val) => val),
  deleteField: jest.fn(() => ({ __deleteField: true })),
}))

function mockQuerySnapshot(docs: any[]) {
  return { docs, forEach: (cb: any) => docs.forEach(cb) }
}

describe('portal classService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchStudentList', () => {
    it('fetches and transforms student records from Firestore', async () => {
      const mockData = {
        personal: {
          studentFirstName: 'Timmy',
          studentLastName: 'Turner',
          email: 'timmy@example.com',
        },
        academic: { school: 'Dimmsdale', grade: 5 },
      }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockData,
      })

      const res = await classService.fetchStudentList(['uid-1'])
      expect(res.length).toBe(1)
      expect(res[0].name).toBe('Timmy Turner')
    })
  })

  describe('fetchClassDetails', () => {
    it('returns class data when the document exists', async () => {
      const mockData = { course: 'Python 1', students: ['s-1'] }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockData,
      })

      const res = await classService.fetchClassDetails('c-1')
      expect(res).toEqual(mockData)
    })

    it('returns null when the class document does not exist', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      const res = await classService.fetchClassDetails('c-1')
      expect(res).toBeNull()
    })

    it('propagates errors from getDoc', async () => {
      ;(firestore.getDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(classService.fetchClassDetails('c-1')).rejects.toThrow(
        'permission-denied',
      )
    })
  })

  describe('fetchStudentListForClass', () => {
    it('fetches enrolled students for a class', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ course: 'Python 1', students: ['s-1'] }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            personal: {
              studentFirstName: 'Timmy',
              studentLastName: 'Turner',
              email: 'timmy@example.com',
            },
          }),
        })

      const res = await classService.fetchStudentListForClass('c-1')
      expect(res).toHaveLength(1)
      expect(res[0].name).toBe('Timmy Turner')
    })

    it('returns an empty array when the class does not exist', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      const res = await classService.fetchStudentListForClass('c-1')
      expect(res).toEqual([])
    })

    it('returns an empty array when the class has no students field', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ course: 'Python 1' }),
      })

      const res = await classService.fetchStudentListForClass('c-1')
      expect(res).toEqual([])
    })
  })

  describe('updateClassStatuses', () => {
    it('updates classStatuses on class doc', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await classService.updateClassStatuses('c-1', ['Everything Complete'])
      expect(firestore.updateDoc).toHaveBeenCalled()
    })
  })

  describe('updateMeetingTimes', () => {
    it('updates meetingTimes, feedback, and statuses on class doc', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await classService.updateMeetingTimes('c-1', [], [true], ['Complete'])
      expect(firestore.updateDoc).toHaveBeenCalled()
    })
  })

  describe('recordClassSession', () => {
    it('updates completedClassDates and classStatuses', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await classService.recordClassSession('c-1', [new Date()], ['Complete'])
      expect(firestore.updateDoc).toHaveBeenCalled()
    })
  })

  describe('submitSubRequest', () => {
    it('saves sub request payload to substituteRequestsCollection', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await classService.submitSubRequest(
        'c-1',
        1,
        '2026-09-01',
        'Notes',
        'Python 1',
        'inst@example.com',
        'https://zoom.us',
      )
      expect(firestore.setDoc).toHaveBeenCalled()
    })
  })

  describe('saveClassDetails', () => {
    it('sets class details in Firestore with merge: true', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await classService.saveClassDetails('c-1', { course: 'Python 1' })
      expect(firestore.setDoc).toHaveBeenCalled()
    })
  })

  describe('fetchInstructorClasses', () => {
    it('combines mapped-access and owned classes, converting timestamps', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ classIds: ['inst-1-a'] }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            course: 'Python 1',
            meetingTimes: [{ seconds: 1779900600 }],
            completedClassDates: [{ seconds: 1779900600 }],
          }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ course: 'Python 2' }),
        })
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnapshot([{ id: 'uid-1-owned' }, { id: 'other-owner-1' }]),
      )

      const res = await classService.fetchInstructorClasses('uid-1')

      expect(Object.keys(res).sort()).toEqual(['inst-1-a', 'uid-1-owned'])
      expect(res['inst-1-a'].meetingTimes[0]).toBeInstanceOf(Date)
      expect(res['inst-1-a'].completedClassDates[0]).toBeInstanceOf(Date)
    })

    it('falls back to an empty accessible list when the mapping doc exists but has no classIds field', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({}),
      })
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnapshot([]),
      )

      const res = await classService.fetchInstructorClasses('uid-1')
      expect(res).toEqual({})
    })

    it('falls back to an empty accessible list when no mapping doc exists', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnapshot([]),
      )

      const res = await classService.fetchInstructorClasses('uid-1')
      expect(res).toEqual({})
    })

    it('skips class ids whose document no longer exists', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ classIds: ['gone-1'] }),
        })
        .mockResolvedValueOnce({ exists: () => false })
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnapshot([]),
      )

      const res = await classService.fetchInstructorClasses('uid-1')
      expect(res).toEqual({})
    })

    it('returns an empty object and logs on fetch failure rather than throwing', async () => {
      ;(firestore.getDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const res = await classService.fetchInstructorClasses('uid-1')
      expect(res).toEqual({})
      expect(errorSpy).toHaveBeenCalledWith(
        'Error fetching instructor classes:',
        expect.any(Error),
      )
      errorSpy.mockRestore()
    })
  })

  describe('updateInstructorClassMappings', () => {
    it('updates the mapping for the main instructor when the doc already exists', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await classService.updateInstructorClassMappings(
        'c-1',
        'main-uid',
        [],
        [],
      )

      expect(firestore.updateDoc).toHaveBeenCalledTimes(1)
      expect(firestore.setDoc).not.toHaveBeenCalled()
    })

    it('creates the mapping doc via setDoc when updateDoc fails (doc missing)', async () => {
      ;(firestore.updateDoc as jest.Mock).mockRejectedValueOnce(
        new Error('not-found'),
      )
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await classService.updateInstructorClassMappings(
        'c-1',
        'main-uid',
        [],
        [],
      )

      expect(firestore.setDoc).toHaveBeenCalledWith(expect.anything(), {
        classIds: ['c-1'],
      })
    })

    it('grants access to each newly added co-instructor uid', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)

      await classService.updateInstructorClassMappings(
        'c-1',
        'main-uid',
        [],
        ['co-uid-1', 'co-uid-2'],
      )

      expect(firestore.updateDoc).toHaveBeenCalledTimes(3)
      expect(firestore.arrayUnion).toHaveBeenCalledTimes(3)
      expect(firestore.arrayRemove).not.toHaveBeenCalled()
    })

    // Before this, a uid dropped from a class's co-instructor list kept the
    // class on their dashboard forever - there was no removal path at all.
    it('revokes the mapping of a co-instructor who was removed', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)

      await classService.updateInstructorClassMappings(
        'c-1',
        'main-uid',
        ['co-uid-1', 'co-uid-2'],
        ['co-uid-2'],
      )

      expect(firestore.arrayRemove).toHaveBeenCalledTimes(1)
      expect(firestore.arrayRemove).toHaveBeenCalledWith('c-1')
      // Two writes: the owner's mapping (rewritten every save) and the
      // revoke. The co-instructor who didn't move is left alone.
      expect(firestore.updateDoc).toHaveBeenCalledTimes(2)
    })

    it('leaves an unchanged co-instructor alone', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)

      await classService.updateInstructorClassMappings(
        'c-1',
        'main-uid',
        ['co-uid-1'],
        ['co-uid-1'],
      )

      // The owner's mapping, and nothing else.
      expect(firestore.updateDoc).toHaveBeenCalledTimes(1)
      expect(firestore.arrayRemove).not.toHaveBeenCalled()
    })

    // The owner reaches the class through the `${uid}-${n}` ID prefix as well,
    // so revoking their mapping would be both wrong and useless.
    it('never revokes the class owner, even if they are listed as a co-instructor', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)

      await classService.updateInstructorClassMappings(
        'c-1',
        'main-uid',
        ['main-uid'],
        [],
      )

      expect(firestore.arrayRemove).not.toHaveBeenCalled()
      expect(firestore.arrayUnion).toHaveBeenCalledTimes(1)
    })

    it('logs and does not throw if a mapping write fails entirely', async () => {
      ;(firestore.updateDoc as jest.Mock).mockRejectedValue(
        new Error('update failed'),
      )
      ;(firestore.setDoc as jest.Mock).mockRejectedValue(
        new Error('set failed'),
      )
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await expect(
        classService.updateInstructorClassMappings('c-1', 'main-uid', [], []),
      ).resolves.toBeUndefined()

      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    // One instructor's mapping failing must not decide whether the rest get
    // written - hence allSettled rather than a sequential loop.
    it('still writes the other mappings when one of them fails', async () => {
      ;(firestore.updateDoc as jest.Mock)
        .mockRejectedValueOnce(new Error('update failed'))
        .mockRejectedValueOnce(new Error('update failed'))
        .mockResolvedValue(undefined)
      ;(firestore.setDoc as jest.Mock).mockRejectedValue(
        new Error('set failed'),
      )
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await classService.updateInstructorClassMappings(
        'c-1',
        'main-uid',
        [],
        ['co-uid-1', 'co-uid-2'],
      )

      expect(firestore.updateDoc).toHaveBeenCalledTimes(3)
      errorSpy.mockRestore()
    })
  })

  describe('lookupCoInstructor', () => {
    it('returns the resolved co-instructor on success', async () => {
      const coInstructor = {
        uid: 'co-uid-1',
        email: 'co1@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        accepted: true,
      }
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ instructor: coInstructor }),
      })

      await expect(
        classService.lookupCoInstructor('co1@example.com'),
      ).resolves.toEqual({ ok: true, coInstructor })
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/lookupCoInstructor',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    // The server deliberately gives one message for every rejection reason,
    // so it is shown to the class owner verbatim rather than reinterpreted.
    it('surfaces the server message when the address is refused', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({ message: 'No accepted gbSTEM instructor...' }),
      })

      await expect(
        classService.lookupCoInstructor('nobody@example.com'),
      ).resolves.toEqual({
        ok: false,
        message: 'No accepted gbSTEM instructor...',
      })
    })

    it('reports a generic failure rather than throwing when fetch rejects', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('network error'),
      )
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const res = await classService.lookupCoInstructor('co1@example.com')

      expect(res).toEqual({ ok: false, message: expect.any(String) })
      errorSpy.mockRestore()
    })
  })

  describe('resolveCoInstructors', () => {
    it('returns [] without calling the API when there are no uids', async () => {
      await expect(classService.resolveCoInstructors([])).resolves.toEqual([])
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('posts the uids and returns the identities', async () => {
      const instructors = [{ uid: 'co-uid-1', email: 'co1@example.com' }]
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ instructors }),
      })

      await expect(
        classService.resolveCoInstructors(['co-uid-1']),
      ).resolves.toEqual(instructors)
    })

    // Must NOT swallow this into []. The caller uses the result to decide
    // which stored uids to keep, so a silent empty result on a failed request
    // would wipe a class's co-instructors on the next save.
    it('throws rather than returning [] when the request fails', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await expect(
        classService.resolveCoInstructors(['co-uid-1']),
      ).rejects.toThrow()
    })
  })

  describe('fetchClassesByIds', () => {
    it('fetches and attaches ids for existing class docs, omitting missing ones', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          id: 'c-1',
          data: () => ({ course: 'Python 1' }),
        })
        .mockResolvedValueOnce({ exists: () => false, id: 'c-2' })

      const res = await classService.fetchClassesByIds(['c-1', 'c-2'])
      expect(res).toEqual([{ course: 'Python 1', id: 'c-1' }])
    })

    it('returns an empty array for an empty input', async () => {
      const res = await classService.fetchClassesByIds([])
      expect(res).toEqual([])
      expect(firestore.getDoc).not.toHaveBeenCalled()
    })

    it('propagates errors from getDoc', async () => {
      ;(firestore.getDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(classService.fetchClassesByIds(['c-1'])).rejects.toThrow(
        'permission-denied',
      )
    })
  })

  describe('fetchAllClassesInfo', () => {
    it('parses and sorts all class docs by spots remaining', async () => {
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce(
        mockQuerySnapshot([
          {
            id: 'c-1',
            data: () => ({
              course: 'Full Class',
              classCap: 2,
              students: ['s-1', 's-2'],
            }),
          },
          {
            id: 'c-2',
            data: () => ({
              course: 'Open Class',
              classCap: 5,
              students: ['s-1'],
            }),
          },
        ]),
      )

      const res = await classService.fetchAllClassesInfo()
      expect(res).toHaveLength(2)
      // Open Class (4 spots left) sorts before Full Class (0 spots left)
      expect(res[0].course).toBe('Open Class')
      expect(res[1].course).toBe('Full Class')
    })
  })

  describe('fetchClassCapacityInfo', () => {
    it('returns current enrollment and cap', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        data: () => ({ students: ['s-1', 's-2'], classCap: 5 }),
      })

      const res = await classService.fetchClassCapacityInfo('c-1')
      expect(res).toEqual({ numStudents: 2, classCap: 5 })
    })

    it('defaults numStudents/classCap to 0 when the class document is empty', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        data: () => undefined,
      })

      const res = await classService.fetchClassCapacityInfo('c-1')
      expect(res).toEqual({ numStudents: 0, classCap: 0 })
    })
  })

  describe('fetchBypassAgeLimits', () => {
    it('returns true when the registration has the bypass flag enabled', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        data: () => ({ agreements: { bypassAgeLimits: true } }),
      })

      const res = await classService.fetchBypassAgeLimits('s-1')
      expect(res).toBe(true)
    })

    it('returns false when the registration document has no data', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        data: () => undefined,
      })

      const res = await classService.fetchBypassAgeLimits('s-1')
      expect(res).toBe(false)
    })
  })

  describe('enrollStudentInClass', () => {
    it('adds the student to the class roster', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await classService.enrollStudentInClass('c-1', 's-1')
      expect(firestore.updateDoc).toHaveBeenCalledWith(expect.anything(), {
        students: 's-1',
      })
    })

    it('propagates errors from updateDoc', async () => {
      ;(firestore.updateDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )
      await expect(
        classService.enrollStudentInClass('c-1', 's-1'),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('confirmStudentClassEnrollment', () => {
    it('adds the class and marks the registration enrolled', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await classService.confirmStudentClassEnrollment('s-1', 'c-1')
      expect(firestore.updateDoc).toHaveBeenCalledWith(expect.anything(), {
        classes: 'c-1',
        enrolled: true,
      })
    })
  })

  describe('unenrollStudentFromClass', () => {
    it('removes the student from the class roster', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await classService.unenrollStudentFromClass('c-1', 's-1')
      expect(firestore.updateDoc).toHaveBeenCalledWith(expect.anything(), {
        students: 's-1',
      })
    })
  })

  describe('confirmStudentClassUnenrollment', () => {
    it('sets enrolled=true when other classes remain after removal', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        data: () => ({ classes: ['c-2'] }),
      })

      await classService.confirmStudentClassUnenrollment('s-1', 'c-1')

      expect(firestore.updateDoc).toHaveBeenLastCalledWith(expect.anything(), {
        enrolled: true,
      })
    })

    it('sets enrolled=false when no classes remain', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        data: () => ({ classes: [] }),
      })

      await classService.confirmStudentClassUnenrollment('s-1', 'c-1')

      expect(firestore.updateDoc).toHaveBeenLastCalledWith(expect.anything(), {
        enrolled: false,
      })
    })

    it('defaults to enrolled=false when the registration has no classes field', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        data: () => ({}),
      })

      await classService.confirmStudentClassUnenrollment('s-1', 'c-1')

      expect(firestore.updateDoc).toHaveBeenLastCalledWith(expect.anything(), {
        enrolled: false,
      })
    })

    it('propagates errors from updateDoc', async () => {
      ;(firestore.updateDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )
      await expect(
        classService.confirmStudentClassUnenrollment('s-1', 'c-1'),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('fetchStudentNames', () => {
    it('fetches names in input order', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          data: () => ({
            personal: { studentFirstName: 'Alice', studentLastName: 'A' },
          }),
        })
        .mockResolvedValueOnce({
          data: () => ({
            personal: { studentFirstName: 'Bob', studentLastName: 'B' },
          }),
        })

      const res = await classService.fetchStudentNames(['s-1', 's-2'])
      expect(res).toEqual(['Alice A', 'Bob B'])
    })

    it("resolves individual lookup failures to 'Error' rather than rejecting the whole batch", async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          data: () => ({
            personal: { studentFirstName: 'Alice', studentLastName: 'A' },
          }),
        })
        .mockRejectedValueOnce(new Error('permission-denied'))
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const res = await classService.fetchStudentNames(['s-1', 's-2'])
      expect(res).toEqual(['Alice A', 'Error'])
      errorSpy.mockRestore()
    })
  })

  describe('submitInstructorFeedback', () => {
    const feedback = {
      date: '2026-01-01',
      feedback: 'Great class',
      attendanceList: {},
      courseName: 'Python 1',
      classNumber: 1,
      instructorName: 'Jane Doe',
    }

    it('saves feedback and updates the class document', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await classService.submitInstructorFeedback(
        'c-1',
        feedback,
        [true],
        ['Everything Complete'],
      )

      expect(firestore.setDoc).toHaveBeenCalledTimes(1)
      expect(firestore.updateDoc).toHaveBeenCalledTimes(1)
    })

    // The substitute half of this used to live here and could not work: the
    // class update above is refused for anyone who is not an instructor of the
    // class, which a substitute never is. It moved to /api/substituteFeedback,
    // so this writes the class and nothing else.
    it('does not touch any substitute request', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)

      await classService.submitInstructorFeedback(
        'c-1',
        feedback,
        [true],
        ['Everything Complete'],
      )

      expect(firestore.updateDoc).toHaveBeenCalledTimes(1)
    })

    it('propagates errors from setDoc', async () => {
      ;(firestore.setDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        classService.submitInstructorFeedback('c-1', feedback, [], []),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('submitStudentFeedback', () => {
    it('saves the feedback document', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await classService.submitStudentFeedback('c-1', {
        studentId: 's-1',
        date: '2026-01-01',
        classId: 'c-1',
        rating: 5,
        feedback: 'Loved it!',
        instructor: 'Jane Doe',
        studentName: 'Timmy Turner',
        course: 'Python 1',
      })

      expect(firestore.setDoc).toHaveBeenCalledTimes(1)
    })

    it('propagates errors from setDoc', async () => {
      ;(firestore.setDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        classService.submitStudentFeedback('c-1', {} as any),
      ).rejects.toThrow('permission-denied')
    })
  })
})
