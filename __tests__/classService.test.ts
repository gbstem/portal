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
    const body = {
      classId: 'uid-1-1',
      details: {
        course: 'Python 1',
        gradeRecommendation: '',
        classCap: 7,
        meetingLink: '',
        classDay1: 'Monday' as const,
        classTime1: '16:00',
        classDay2: '' as const,
        classTime2: '',
        online: true,
        otherInstructorUids: [],
      },
    }

    it('posts the class to /api/classDetails rather than writing Firestore', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ classId: 'uid-1-1' }),
      })

      await classService.saveClassDetails(body)

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/classDetails',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        }),
      )
      expect(firestore.setDoc).not.toHaveBeenCalled()
    })

    it("throws the server's message when the save is refused", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: 'You are not an instructor of that class.',
        }),
      })

      await expect(classService.saveClassDetails(body)).rejects.toThrow(
        'You are not an instructor of that class.',
      )
    })

    it('falls back to a generic message when the refusal has no body', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('not json')
        },
      })

      await expect(classService.saveClassDetails(body)).rejects.toThrow(
        'Could not save class details. Please try again.',
      )
    })
  })

  describe('fetchInstructorClasses', () => {
    it('loads classes from /api/classDetails, turning session dates back into Dates', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          classes: {
            'uid-1-1': {
              course: 'Python 1',
              meetingTimes: ['2026-10-05T20:00:00.000Z'],
              completedClassDates: [],
            },
          },
        }),
      })

      const res = await classService.fetchInstructorClasses()

      expect(global.fetch).toHaveBeenCalledWith('/api/classDetails')
      expect(res['uid-1-1'].course).toBe('Python 1')
      expect(res['uid-1-1'].meetingTimes).toEqual([
        new Date('2026-10-05T20:00:00.000Z'),
      ])
      expect(res['uid-1-1'].completedClassDates).toEqual([])
    })

    it('returns an empty object and logs when the request is refused', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
      })
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await expect(classService.fetchInstructorClasses()).resolves.toEqual({})
      expect(errorSpy).toHaveBeenCalledWith(
        'Error fetching instructor classes:',
        expect.any(Error),
      )
      errorSpy.mockRestore()
    })

    it('returns an empty object rather than throwing when fetch rejects', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'))
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await expect(classService.fetchInstructorClasses()).resolves.toEqual({})
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

  describe('enrollStudent', () => {
    it('posts the enrollment to /api/enroll rather than writing Firestore', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ emailSent: true }),
      })

      const res = await classService.enrollStudent('c-1', 's-1')

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/enroll',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ classId: 'c-1', studentUid: 's-1' }),
        }),
      )
      expect(res).toEqual({ emailSent: true })
      expect(firestore.updateDoc).not.toHaveBeenCalled()
    })

    it("throws the server's message when the enrollment is refused", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'That class is full.' }),
      })

      await expect(classService.enrollStudent('c-1', 's-1')).rejects.toThrow(
        'That class is full.',
      )
    })

    it('throws a generic message when the refusal has no readable body', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('not json')
        },
      })

      await expect(classService.enrollStudent('c-1', 's-1')).rejects.toThrow(
        'Error enrolling in class!',
      )
    })
  })

  describe('unenrollStudent', () => {
    it('sends the unenrollment to /api/enroll rather than writing Firestore', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Unenrolled from class.' }),
      })

      await classService.unenrollStudent('c-1', 's-1')

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/enroll',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ classId: 'c-1', studentUid: 's-1' }),
        }),
      )
      expect(firestore.updateDoc).not.toHaveBeenCalled()
    })

    it("throws the server's message when the unenrollment is refused", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: 'You can only enroll your own students.',
        }),
      })

      await expect(classService.unenrollStudent('c-1', 's-1')).rejects.toThrow(
        'You can only enroll your own students.',
      )
    })

    it('throws a generic message when the refusal has no readable body', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('not json')
        },
      })

      await expect(classService.unenrollStudent('c-1', 's-1')).rejects.toThrow(
        'Error unenrolling from class!',
      )
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

  describe('fetchClassRoster', () => {
    it('fetches roster from /api/classRoster', async () => {
      const mockStudents = [
        {
          uid: 's-1',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          secondaryEmail: '',
          phone: '1234567890',
          grade: 5,
          school: 'STEM School',
        },
      ]
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ students: mockStudents }),
      })

      const res = await classService.fetchClassRoster('c-1')
      expect(global.fetch).toHaveBeenCalledWith('/api/classRoster?classId=c-1')
      expect(res).toEqual(mockStudents)
    })

    it('passes subRequestId when provided', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ students: [] }),
      })

      await classService.fetchClassRoster('c-1', 'sub-123')
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/classRoster?classId=c-1&subRequestId=sub-123',
      )
    })

    it('throws error when response is not ok', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Forbidden',
        json: async () => ({ message: 'Not authorized' }),
      })

      await expect(classService.fetchClassRoster('c-1')).rejects.toThrow(
        'Not authorized',
      )
    })
  })

  describe('fetchStudentNamesForClass', () => {
    it('maps student names from the roster', async () => {
      const mockStudents = [
        { uid: 's-1', name: 'Ada Lovelace' },
        { uid: 's-2', name: 'Grace Hopper' },
      ]
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ students: mockStudents }),
      })

      const res = await classService.fetchStudentNamesForClass('c-1')
      expect(res).toEqual(['Ada Lovelace', 'Grace Hopper'])
    })
  })
})
