import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import { substituteService } from '$lib/services/substituteService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  getCountFromServer: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  writeBatch: jest.fn(() => mockBatch),
}))

const mockBatch = { set: jest.fn(), delete: jest.fn(), commit: jest.fn() }

function snapshot(docs: { id: string; data: Record<string, unknown> }[]) {
  return { docs: docs.map(({ id, data }) => ({ id, data: () => data })) }
}

describe('substituteService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchUserSubRequests', () => {
    it("reads the user's own requests and cover directly, and open sessions from /api/substitute", async () => {
      ;(firestore.getDocs as jest.Mock)
        .mockResolvedValueOnce(
          snapshot([
            {
              id: 'c-1---1',
              data: { course: 'Python 1', requestedByUid: 'u' },
            },
          ]),
        )
        .mockResolvedValueOnce(
          snapshot([
            {
              id: 'c-1---1',
              data: { course: 'Python 1', originalInstructorUid: 'u' },
            },
            {
              id: 'c-1---2',
              data: { course: 'Python 1', originalInstructorUid: 'u' },
            },
          ]),
        )
        .mockResolvedValueOnce(
          snapshot([
            {
              id: 'o-1---3',
              data: { course: 'Scratch', subInstructorId: 'u' },
            },
          ]),
        )
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subRequests: [
            {
              id: 'o-2---1',
              course: 'Math',
              classNumber: 1,
              dateOfClass: '2026-10-05T20:00:00.000Z',
            },
          ],
        }),
      })

      const res = await substituteService.fetchUserSubRequests('u')

      // Once each, even a request the user filed for their own class.
      expect(res.userSubRequests.map((one) => one.id)).toEqual([
        'c-1---1',
        'c-1---2',
      ])
      expect(res.userSubClasses.map((one) => one.id)).toEqual(['o-1---3'])
      expect(res.classesMissingSubs).toEqual([
        {
          id: 'o-2---1',
          course: 'Math',
          classNumber: 1,
          dateOfClass: new Date('2026-10-05T20:00:00.000Z'),
        },
      ])
      expect(firestore.where).toHaveBeenCalledWith('requestedByUid', '==', 'u')
      expect(firestore.where).toHaveBeenCalledWith(
        'originalInstructorUid',
        '==',
        'u',
      )
      expect(firestore.where).toHaveBeenCalledWith('subInstructorId', '==', 'u')
      expect(global.fetch).toHaveBeenCalledWith('/api/substitute')
    })

    it('throws when the open sessions cannot be loaded', async () => {
      ;(firestore.getDocs as jest.Mock)
        .mockResolvedValueOnce(snapshot([]))
        .mockResolvedValueOnce(snapshot([]))
        .mockResolvedValueOnce(snapshot([]))
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(substituteService.fetchUserSubRequests('u')).rejects.toThrow(
        '403',
      )
    })
  })

  describe('countCompletedSubClasses', () => {
    it('counts server-side, only the sessions this user covered and closed out', async () => {
      ;(firestore.getCountFromServer as jest.Mock).mockResolvedValueOnce({
        data: () => ({ count: 3 }),
      })

      const count = await substituteService.countCompletedSubClasses('user123')

      expect(count).toBe(3)
      expect(firestore.where).toHaveBeenCalledWith(
        'subInstructorId',
        '==',
        'user123',
      )
      expect(firestore.where).toHaveBeenCalledWith(
        'subRequestStatus',
        '==',
        SubRequestStatus.NoSubstituteNeeded,
      )
      expect(firestore.getDocs).not.toHaveBeenCalled()
    })

    it('propagates errors from the count', async () => {
      ;(firestore.getCountFromServer as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        substituteService.countCompletedSubClasses('user123'),
      ).rejects.toThrow('permission-denied')
    })
  })

  // Filing, editing and cancelling go through /api/subRequest: firestore.rules
  // gives instructors no write access to subRequests. The request is named by
  // the document id it was read from - an edit once rebuilt it from the
  // signed-in uid (`${uid}---${n}`), a document no class has ever been stored
  // at, and every edit landed there.
  const sent = () => {
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0]
    return { url, method: options.method, body: JSON.parse(options.body) }
  }

  describe('saveSubRequest', () => {
    it('sends the id it was read from, with the session and notes - not the date, which follows the session', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await substituteService.saveSubRequest({
        id: 'owner-uid-1---2',
        classNumber: 3,
        dateOfClass: new Date('2026-10-05T20:00:00.000Z'),
        notes: 'edited',
        requestedByUid: 'someone-else',
      } as Data.SubRequest)

      expect(sent()).toEqual({
        url: '/api/subRequest',
        method: 'PATCH',
        body: {
          subRequestId: 'owner-uid-1---2',
          classNumber: 3,
          notes: 'edited',
        },
      })
      expect(firestore.writeBatch).not.toHaveBeenCalled()
    })

    it("throws with the server's message on refusal", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: 'That session already has a sub request.',
        }),
      })

      await expect(
        substituteService.saveSubRequest({
          id: 'owner-uid-1---2',
          classNumber: 3,
          dateOfClass: new Date(),
          notes: '',
        } as Data.SubRequest),
      ).rejects.toThrow('That session already has a sub request.')
    })
  })

  describe('deleteSubRequest', () => {
    it('cancels exactly the document it is given', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await substituteService.deleteSubRequest('owner-uid-1---2')

      expect(sent()).toEqual({
        url: '/api/subRequest',
        method: 'DELETE',
        body: { subRequestId: 'owner-uid-1---2' },
      })
      expect(firestore.deleteDoc).not.toHaveBeenCalled()
    })
  })

  // These go through endpoints rather than the client SDK: a substitute is not
  // an instructor of the class they are covering, so firestore.rules refuses
  // those writes from the browser. The service's job is to call the endpoint
  // and to turn a failure into a message a component can show.
  describe('recordSubstituteSession', () => {
    it('posts the request id and returns the meeting link', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meetingLink: 'https://zoom.us/j/1',
          alreadyRecorded: false,
        }),
      } as any)

      const res = await substituteService.recordSubstituteSession('c-1---2')

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/substituteSession',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ subRequestId: 'c-1---2' }),
        }),
      )
      expect(res.meetingLink).toBe('https://zoom.us/j/1')
    })

    it('throws the server’s message so the caller can show it', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: 'You are not the substitute for that class.',
        }),
      } as any)

      await expect(
        substituteService.recordSubstituteSession('c-1---2'),
      ).rejects.toThrow('You are not the substitute for that class.')
    })

    it('falls back to a readable message when the server sends none', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      } as any)

      await expect(
        substituteService.recordSubstituteSession('c-1---2'),
      ).rejects.toThrow('Could not start that class. Please try again.')
    })
  })

  describe('submitSubstituteFeedback', () => {
    const payload = {
      subRequestId: 'c-1---2',
      date: '2026-10-02',
      feedback: 'Went well.',
      attendanceList: { 'Ada Lovelace': { present: true } },
      classNumber: 2,
    }

    it('posts the feedback and returns the document id', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ feedbackId: 'c-1-123' }),
      } as any)

      const res = await substituteService.submitSubstituteFeedback(payload)

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/substituteFeedback',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      )
      expect(res.feedbackId).toBe('c-1-123')
    })

    it('throws the server’s message so the form can show it', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message:
            'That request is for class #2, so its feedback has to be too.',
        }),
      } as any)

      await expect(
        substituteService.submitSubstituteFeedback({
          ...payload,
          classNumber: 5,
        }),
      ).rejects.toThrow('That request is for class #2')
    })
  })

  describe('claimSubstituteSlot', () => {
    it('posts only the request id and returns the claimed request', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          subRequest: {
            id: 'c-1---2',
            course: 'Scratch',
            dateOfClass: '2026-10-05T20:00:00.000Z',
            subInstructorFirstName: 'Jane',
          },
        }),
      })

      const claimed = await substituteService.claimSubstituteSlot('c-1---2')

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/substitute',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ subRequestId: 'c-1---2' }),
        }),
      )
      expect(claimed.dateOfClass).toEqual(new Date('2026-10-05T20:00:00.000Z'))
      expect(claimed.subInstructorFirstName).toBe('Jane')
      expect(firestore.updateDoc).not.toHaveBeenCalled()
    })

    it('throws the server’s message, e.g. when somebody signed up first', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message: 'Somebody has already signed up to cover that class.',
        }),
      })

      await expect(
        substituteService.claimSubstituteSlot('c-1---2'),
      ).rejects.toThrow('Somebody has already signed up to cover that class.')
    })

    it('falls back to a readable message when the server sends none', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'Failed to send email. Please try again later.',
        }),
      })

      await expect(
        substituteService.claimSubstituteSlot('c-1---2'),
      ).rejects.toThrow('Error signing up to substitute, please try again.')
    })
  })

  describe('fetchCoveredInstructorEmails', () => {
    const covered = [
      { id: 'owner-1---2', originalInstructorUid: 'owner-uid' },
      { id: 'owner-1---3', originalInstructorUid: 'owner-uid' },
    ] as Data.SubRequest[]

    it('asks once for every session and keys the addresses by request', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ emails: { 'owner-uid': 'owner@gbstem.org' } }),
      })

      await expect(
        substituteService.fetchCoveredInstructorEmails(covered),
      ).resolves.toEqual({
        'owner-1---2': 'owner@gbstem.org',
        'owner-1---3': 'owner@gbstem.org',
      })
      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/resolveEmails')
      // The same instructor twice is one uid to look up, but both sessions
      // are named so the server can check each one is really the caller's.
      expect(JSON.parse(init.body)).toEqual({
        intent: 'coveredSubRequestInstructor',
        uids: ['owner-uid'],
        context: { subRequestIds: ['owner-1---2', 'owner-1---3'] },
      })
    })

    it('leaves out a session whose instructor account is gone', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ emails: { 'owner-uid': null } }),
      })

      await expect(
        substituteService.fetchCoveredInstructorEmails(covered),
      ).resolves.toEqual({})
    })

    it('makes no request when no session records an instructor uid', async () => {
      await expect(
        substituteService.fetchCoveredInstructorEmails([
          { id: 'legacy-1---1' } as Data.SubRequest,
        ]),
      ).resolves.toEqual({})
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})
