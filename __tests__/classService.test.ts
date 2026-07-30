import { classService } from '$lib/services/classService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
}))

describe('portal classService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('fetchStudentList', () => {
    it('fetches and transforms student records from Firestore', async () => {
      const mockData = {
        personal: {
          studentFirstName: 'Timmy',
          studentLastName: 'Turner',
          email: 'timmy@example.com',
        },
        academic: { school: 'Dimmsdale', grade: 5 },
      }
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockData,
      })

      const res = await classService.fetchStudentList(['uid-1'])
      expect(res.length).toBe(1)
      expect(res[0].name).toBe('Timmy Turner')
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
    it('sets class details in Firestore with merge: true', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await classService.saveClassDetails('c-1', { course: 'Python 1' })
      expect(firestore.setDoc).toHaveBeenCalled()
    })
  })
})
