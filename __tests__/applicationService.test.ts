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

    it('recovers from a transient transport failure', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const mockData = { personal: { email: 'app@example.com' } }
      // ApplyForm creates the draft application from this read's result, so a
      // dropped stream here used to mean the application was never created.
      ;(firestore.getDoc as jest.Mock)
        .mockRejectedValueOnce(
          Object.assign(new Error('unavailable'), { code: 'unavailable' }),
        )
        .mockResolvedValueOnce({ exists: () => true, data: () => mockData })

      const app = await applicationService.fetchUserApplication('uid-1')

      expect(app).toEqual(mockData)
      expect(firestore.getDoc).toHaveBeenCalledTimes(2)
      warnSpy.mockRestore()
    })

    it('propagates a non-transient error without retrying', async () => {
      ;(firestore.getDoc as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error('permission-denied'), {
          code: 'permission-denied',
        }),
      )

      await expect(
        applicationService.fetchUserApplication('uid-1'),
      ).rejects.toThrow('permission-denied')
      expect(firestore.getDoc).toHaveBeenCalledTimes(1)
    })
  })

  describe('createUserApplication', () => {
    it('writes the whole document with semester info, without merging', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      const mockApp = {
        personal: { email: 'test@example.com' },
        meta: {
          uid: 'uid-1',
          submitted: false,
          interview: false,
          decided: false,
        },
      } as Data.Application

      await applicationService.createUserApplication('uid-1', mockApp)

      expect(firestore.setDoc).toHaveBeenCalledTimes(1)
      const [, payload, options] = (firestore.setDoc as jest.Mock).mock.calls[0]
      expect(payload).toEqual(
        expect.objectContaining({
          personal: { email: 'test@example.com' },
          semester: expect.any(String),
        }),
      )
      // The draft has to land with every meta field present, since admin's lists
      // query on `meta.submitted == false` / `meta.decided == false`.
      expect(payload.meta).toEqual({
        uid: 'uid-1',
        submitted: false,
        interview: false,
        decided: false,
      })
      expect(options).toBeUndefined()
    })
  })

  describe('updateUserApplication', () => {
    it('merges only the given fields so admin-owned ones survive', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)

      await applicationService.updateUserApplication('uid-1', {
        personal: { phoneNumber: '555-123-4567' },
      })

      expect(firestore.setDoc).toHaveBeenCalledTimes(1)
      const [, payload, options] = (firestore.setDoc as jest.Mock).mock.calls[0]
      expect(payload).toEqual({
        personal: { phoneNumber: '555-123-4567' },
        semester: expect.any(String),
      })
      // Never a full overwrite - see updateUserApplication's docstring.
      expect(options).toEqual({ merge: true })
      expect(payload).not.toHaveProperty('meta')
    })

    it('propagates errors from setDoc', async () => {
      ;(firestore.setDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        applicationService.updateUserApplication('uid-1', {}),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('fetchDecisionType', () => {
    it('returns the decision type if a decision doc exists', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ type: 'accepted' }),
      })

      const decision = await applicationService.fetchDecisionType('uid-1')
      expect(decision).toBe('accepted')
    })

    it('returns null if no decision doc exists', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      })

      const decision = await applicationService.fetchDecisionType('uid-1')
      expect(decision).toBeNull()
    })

    it('propagates errors from getDoc', async () => {
      ;(firestore.getDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(
        applicationService.fetchDecisionType('uid-1'),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('fetchApplicationDashboardStatus', () => {
    it('returns null when no application exists', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({ exists: () => false })
        .mockResolvedValueOnce({ exists: () => false })

      const status =
        await applicationService.fetchApplicationDashboardStatus('uid-1')
      expect(status).toBeNull()
    })

    it('returns null when the application exists but was not submitted', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ meta: { submitted: false } }),
        })
        .mockResolvedValueOnce({ exists: () => false })

      const status =
        await applicationService.fetchApplicationDashboardStatus('uid-1')
      expect(status).toBeNull()
    })

    it("returns 'submitted' when submitted but no decision recorded yet", async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ meta: { submitted: true } }),
        })
        .mockResolvedValueOnce({ exists: () => false })

      const status =
        await applicationService.fetchApplicationDashboardStatus('uid-1')
      expect(status).toBe('submitted')
    })

    it('returns the decision type once a decision has been recorded', async () => {
      ;(firestore.getDoc as jest.Mock)
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ meta: { submitted: true } }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ type: 'waitlisted' }),
        })

      const status =
        await applicationService.fetchApplicationDashboardStatus('uid-1')
      expect(status).toBe('waitlisted')
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
