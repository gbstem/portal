import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import { substituteService } from '$lib/services/substituteService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
}))

describe('substituteService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchUserSubRequests', () => {
    it('queries substitute requests and returns categorized results', async () => {
      const mockDocs = [
        {
          id: 'user123---1',
          data: () => ({
            subRequestStatus: SubRequestStatus.SubstituteNeeded,
            course: 'Python 1',
          }),
        },
      ]
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        docs: mockDocs,
      })

      const res = await substituteService.fetchUserSubRequests('user123')
      expect(res.userSubRequests.length).toBe(1)
      expect(res.classesMissingSubs.length).toBe(1)
    })
  })

  describe('countCompletedSubClasses', () => {
    it('counts only docs where this user completed a sub assignment', async () => {
      const mockDocs = [
        {
          data: () => ({
            subInstructorId: 'user123',
            subRequestStatus: SubRequestStatus.NoSubstituteNeeded,
          }),
        },
        {
          data: () => ({
            subInstructorId: 'user123',
            subRequestStatus: SubRequestStatus.SubstituteFound,
          }),
        },
        {
          data: () => ({
            subInstructorId: 'someone-else',
            subRequestStatus: SubRequestStatus.NoSubstituteNeeded,
          }),
        },
      ]
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        forEach: (cb: any) => mockDocs.forEach(cb),
      })

      const count = await substituteService.countCompletedSubClasses('user123')
      expect(count).toBe(1)
    })

    it('returns 0 when there are no matching requests', async () => {
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        forEach: (cb: any) => [].forEach(cb),
      })

      const count = await substituteService.countCompletedSubClasses('user123')
      expect(count).toBe(0)
    })

    it('propagates errors from getDocs', async () => {
      ;(firestore.getDocs as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        substituteService.countCompletedSubClasses('user123'),
      ).rejects.toThrow('permission-denied')
    })
  })

  // Every assertion here is on the document *path*. These tests used to check
  // only that setDoc/deleteDoc had been called at all, which is how an edit
  // that wrote to `${signedInUid}---${n}` - a document no class has ever been
  // stored at - passed for as long as it did.
  const pathOf = (call: number = 0) =>
    (firestore.doc as jest.Mock).mock.calls[call][2]

  describe('saveSubRequest', () => {
    it('writes back to the document the request was read from', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      const subReq = {
        id: 'owner-uid-1---2',
        classNumber: 2,
        notes: 'edited',
      } as Data.SubRequest

      await substituteService.saveSubRequest(subReq)

      expect(pathOf()).toBe('owner-uid-1---2')
      // The stored `id` field means the class, the way creation writes it.
      expect(firestore.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'owner-uid-1', notes: 'edited' }),
      )
      expect(firestore.deleteDoc).not.toHaveBeenCalled()
    })

    it('moves the document when the class number changes', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      ;(firestore.deleteDoc as jest.Mock).mockResolvedValueOnce(undefined)
      const subReq = {
        id: 'owner-uid-1---2',
        classNumber: 3,
      } as Data.SubRequest

      await substituteService.saveSubRequest(subReq, 2)

      // Written at the new session number, removed from the old one - both
      // under the class, not under whoever is signed in.
      expect(pathOf(0)).toBe('owner-uid-1---3')
      expect(pathOf(1)).toBe('owner-uid-1---2')
      expect(firestore.deleteDoc).toHaveBeenCalled()
    })

    it('refuses to write a request whose class cannot be determined', async () => {
      const subReq = { id: '', classNumber: 2 } as Data.SubRequest

      await expect(substituteService.saveSubRequest(subReq)).rejects.toThrow(
        /without a class/,
      )
      expect(firestore.setDoc).not.toHaveBeenCalled()
    })
  })

  describe('deleteSubRequest', () => {
    it('deletes exactly the document it is given', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await substituteService.deleteSubRequest('owner-uid-1---2')

      expect(pathOf()).toBe('owner-uid-1---2')
      expect(firestore.deleteDoc).toHaveBeenCalled()
    })
  })

  // These two are the only writes in this service that do not touch Firestore
  // from the browser: a substitute is not an instructor of the class they are
  // covering, so firestore.rules refuses them there. The service's job is now
  // to call the endpoint and to turn a failure into a message a component can
  // show, which is what the old client-side version never did.
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
    it('updates Firestore document and triggers API endpoint', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      const classToSub = {
        id: 'sub-1',
        course: 'Scratch',
        classNumber: 1,
        dateOfClass: { seconds: 1779900600 },
        originalInstructorEmail: 'orig@example.com',
      } as unknown as Data.SubRequest

      const user = {
        object: { uid: 'u1', email: 'sub@example.com' },
        profile: { firstName: 'Jane' },
      } as Data.User.Store

      await substituteService.claimSubstituteSlot(classToSub, user)
      expect(firestore.updateDoc).toHaveBeenCalled()
      expect(global.fetch).toHaveBeenCalledWith(
        'api/substitute',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('sends no substitute address - the handler uses the verified session email', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      const classToSub = {
        id: 'sub-1',
        course: 'Scratch',
        classNumber: 1,
        dateOfClass: { seconds: 1779900600 },
        originalInstructorEmail: 'orig@example.com',
      } as unknown as Data.SubRequest

      const user = {
        object: { uid: 'u1', email: null },
        profile: { firstName: 'Jane' },
      } as unknown as Data.User.Store

      await substituteService.claimSubstituteSlot(classToSub, user)
      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body).not.toHaveProperty('subInstructorEmail')
      expect(body.originalInstructorEmail).toBe('orig@example.com')
      // Recovered from the `${uid}-${n}---${classNumber}` document id - a guess,
      // which is exactly why the address above still travels with it.
      expect(body.originalInstructorUid).toBe('sub')
    })

    it('throws if the substitute signup API responds not-ok', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })

      const classToSub = {
        id: 'sub-1',
        course: 'Scratch',
        classNumber: 1,
        dateOfClass: { seconds: 1779900600 },
        originalInstructorEmail: 'orig@example.com',
      } as unknown as Data.SubRequest

      const user = {
        object: { uid: 'u1', email: 'sub@example.com' },
        profile: { firstName: 'Jane' },
      } as Data.User.Store

      await expect(
        substituteService.claimSubstituteSlot(classToSub, user),
      ).rejects.toThrow('Failed to submit substitute signup request')
    })
  })
})
