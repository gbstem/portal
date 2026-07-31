import { announcementService } from '$lib/services/announcementService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  getDocs: jest.fn(),
}))

describe('announcementService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('fetchAnnouncements', () => {
    it('returns all announcement documents', async () => {
      const mockDocs = [
        { data: () => ({ title: 'Welcome', content: 'Hi there' }) },
        { data: () => ({ title: 'Update', content: 'New feature' }) },
      ]
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        docs: mockDocs,
      })

      const res = await announcementService.fetchAnnouncements()
      expect(res).toEqual([
        { title: 'Welcome', content: 'Hi there' },
        { title: 'Update', content: 'New feature' },
      ])
    })

    it('returns an empty array when there are no announcements', async () => {
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({ docs: [] })

      const res = await announcementService.fetchAnnouncements()
      expect(res).toEqual([])
    })

    it('propagates errors from getDocs', async () => {
      ;(firestore.getDocs as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      await expect(announcementService.fetchAnnouncements()).rejects.toThrow(
        'permission-denied',
      )
    })
  })
})
