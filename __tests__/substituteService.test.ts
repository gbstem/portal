import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import { substituteService } from '$lib/services/substituteService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
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
  })
})
