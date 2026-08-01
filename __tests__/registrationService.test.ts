import { maxChildrenPerAccount } from '$lib/data/collections'
import { registrationService } from '$lib/services/registrationService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

/** A Firestore-shaped error, which is what `retryTransient` keys off of. */
function firestoreError(code: string) {
  return Object.assign(new Error(code), { code })
}

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  deleteDoc: jest.fn(),
}))

describe('registrationService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchRegistration', () => {
    it('returns registration data if document exists', async () => {
      const mockData = { personal: { studentFirstName: 'Timmy' } }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockData,
      })

      const res = await registrationService.fetchRegistration('reg-1')
      expect(res).toEqual(mockData)
    })

    it('returns null if registration document does not exist', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      const res = await registrationService.fetchRegistration('reg-1')
      expect(res).toBeNull()
    })
  })

  describe('saveRegistration', () => {
    it('saves registration data to Firestore', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      const mockData = {
        personal: { studentFirstName: 'Timmy' },
      } as Data.Registration

      await registrationService.saveRegistration('reg-1', mockData)
      expect(firestore.setDoc).toHaveBeenCalled()
    })
  })

  describe('fetchChildRegistrationSlots', () => {
    it('fetches all child slots in parallel, reporting existence and data per slot', async () => {
      const getDocMock = firestore.getDoc as jest.Mock
      for (let i = 0; i < maxChildrenPerAccount; i++) {
        if (i === 0) {
          getDocMock.mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ personal: { studentFirstName: 'Timmy' } }),
          })
        } else {
          getDocMock.mockResolvedValueOnce({ exists: () => false })
        }
      }

      const slots =
        await registrationService.fetchChildRegistrationSlots('parent-1')

      expect(slots).toHaveLength(maxChildrenPerAccount)
      expect(slots[0]).toEqual({
        uid: 'parent-1-1',
        exists: true,
        data: { personal: { studentFirstName: 'Timmy' } },
      })
      expect(slots[1]).toEqual({
        uid: 'parent-1-2',
        exists: false,
        data: null,
      })
      expect(firestore.getDoc).toHaveBeenCalledTimes(maxChildrenPerAccount)
    })

    it('propagates errors from getDoc', async () => {
      ;(firestore.getDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )
      ;(firestore.getDoc as jest.Mock).mockResolvedValue({
        exists: () => false,
      })

      await expect(
        registrationService.fetchChildRegistrationSlots('parent-1'),
      ).rejects.toThrow('permission-denied')
    })

    it('recovers from a transient transport failure on one slot', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      // A dropped WebChannel stream surfaces as `unavailable`. It used to
      // reject the whole call and leave /apply stuck on a blank page.
      ;(firestore.getDoc as jest.Mock)
        .mockRejectedValueOnce(firestoreError('unavailable'))
        .mockResolvedValue({ exists: () => false })

      const slots =
        await registrationService.fetchChildRegistrationSlots('parent-1')

      expect(slots).toHaveLength(maxChildrenPerAccount)
      expect(slots.every((slot) => slot.exists === false)).toBe(true)
      // One extra read: the failed slot retried, the others succeeded first try.
      expect(firestore.getDoc).toHaveBeenCalledTimes(maxChildrenPerAccount + 1)
      warnSpy.mockRestore()
    })
  })

  describe('deleteRegistration', () => {
    it('deletes registration document from Firestore', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await registrationService.deleteRegistration('reg-1')
      expect(firestore.deleteDoc).toHaveBeenCalled()
    })
  })

  describe('submitRegistrationApi', () => {
    it('triggers POST request to /api/registration endpoint', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await registrationService.submitRegistrationApi(
        'Parent',
        'Timmy',
        '2026-09-01',
        'parent@example.com',
      )
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/registration',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('throws error if API request fails', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })

      await expect(
        registrationService.submitRegistrationApi(
          'Parent',
          'Timmy',
          '2026-09-01',
          'parent@example.com',
        ),
      ).rejects.toThrow('Failed to submit registration via API')
    })
  })
})
