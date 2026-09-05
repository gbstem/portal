import { ClassStatus } from '$lib/components/helpers/ClassStatus'
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

  describe('saveSubRequest', () => {
    it('saves substitute request to Firestore', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      const subReq = { classNumber: 2 } as Data.SubRequest

      await substituteService.saveSubRequest('user123', subReq)
      expect(firestore.setDoc).toHaveBeenCalled()
    })

    it('deletes old request if classNumber changed', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      ;(firestore.deleteDoc as jest.Mock).mockResolvedValueOnce(undefined)
      const subReq = { classNumber: 3 } as Data.SubRequest

      await substituteService.saveSubRequest('user123', subReq, 2)
      expect(firestore.setDoc).toHaveBeenCalled()
      expect(firestore.deleteDoc).toHaveBeenCalled()
    })
  })

  describe('deleteSubRequest', () => {
    it('deletes request document from Firestore', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await substituteService.deleteSubRequest('user123', 2)
      expect(firestore.deleteDoc).toHaveBeenCalled()
    })
  })

  describe('recordSubstituteClassSession', () => {
    it('appends the completed date, updates class status, and marks the sub request feedback-needed', async () => {
      const classValues = {
        classStatuses: ['Everything Complete', 'Class Not Held'],
        completedClassDates: [new Date('2026-01-01')],
      }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => classValues,
      })
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)

      const dateOfClass = new Date('2026-01-08')
      const res = await substituteService.recordSubstituteClassSession(
        'sub-req-1',
        'c-1',
        2,
        dateOfClass,
      )

      expect(res).toEqual(classValues)
      expect(firestore.updateDoc).toHaveBeenCalledTimes(2)
      const [, classPayload] = (firestore.updateDoc as jest.Mock).mock.calls[0]
      expect(classPayload.completedClassDates).toEqual([
        new Date('2026-01-01'),
        dateOfClass,
      ])
      expect(classPayload.classStatuses[1]).toBe(ClassStatus.FeedbackIncomplete)
      const [, subReqPayload] = (firestore.updateDoc as jest.Mock).mock.calls[1]
      expect(subReqPayload).toEqual({
        subRequestStatus: SubRequestStatus.SubstituteFeedbackNeeded,
      })
    })

    it('throws if the class document does not exist', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      await expect(
        substituteService.recordSubstituteClassSession(
          'sub-req-1',
          'c-1',
          1,
          new Date(),
        ),
      ).rejects.toThrow('Class document not found.')
    })

    it('propagates errors from getDoc', async () => {
      ;(firestore.getDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        substituteService.recordSubstituteClassSession(
          'sub-req-1',
          'c-1',
          1,
          new Date(),
        ),
      ).rejects.toThrow('permission-denied')
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
