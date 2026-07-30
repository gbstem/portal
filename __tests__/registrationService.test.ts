import { registrationService } from '$lib/services/registrationService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

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
