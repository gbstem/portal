import { applicationService } from '$lib/services/applicationService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
}))

describe('applicationService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchUserApplication', () => {
    it('returns document data if application exists', async () => {
      const mockData = { personal: { email: 'app@example.com' } }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockData,
      })

      const app = await applicationService.fetchUserApplication('uid-1')
      expect(app).toEqual(mockData)
    })

    it('returns null if application does not exist', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      const app = await applicationService.fetchUserApplication('uid-1')
      expect(app).toBeNull()
    })
  })

  describe('saveUserApplication', () => {
    it('saves application data to Firestore with semester info', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      const mockApp = {
        personal: { email: 'test@example.com' },
      } as Data.Application

      await applicationService.saveUserApplication('uid-1', mockApp)
      expect(firestore.setDoc).toHaveBeenCalled()
    })
  })

  describe('submitApplicationApi', () => {
    it('triggers POST request to /api/application endpoint', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await applicationService.submitApplicationApi('Jane')
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/application',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('throws error if response is not ok', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })

      await expect(
        applicationService.submitApplicationApi('Jane'),
      ).rejects.toThrow('Failed to submit application via API')
    })
  })
})
