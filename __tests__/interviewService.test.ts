import { interviewService } from '$lib/services/interviewService'
import { formatDateLocal } from '$lib/utils'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  setDoc: jest.fn(),
}))

describe('interviewService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchInterviewData', () => {
    it('loads from /api/interview, formatting dates in local time and keeping the server’s order', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          scheduledInterview: {
            id: 'slot-mine',
            date: '2026-10-01T14:00:00.000Z',
            interviewerName: 'Jane',
            meetingLink: 'https://zoom.us/1',
            interviewSlotStatus: 'pending',
          },
          availableSlots: [
            {
              id: 'slot-soon',
              date: '2026-10-02T14:00:00.000Z',
              interviewerName: 'Jane',
            },
            {
              id: 'slot-later',
              date: '2026-10-03T14:00:00.000Z',
              interviewerName: 'Ravi',
            },
          ],
        }),
      })

      const res = await interviewService.fetchInterviewData()

      expect(global.fetch).toHaveBeenCalledWith('/api/interview')
      expect(res.scheduledInterview).toEqual({
        id: 'slot-mine',
        date: formatDateLocal(new Date('2026-10-01T14:00:00.000Z')),
        interviewerName: 'Jane',
        meetingLink: 'https://zoom.us/1',
        interviewSlotStatus: 'pending',
      })
      expect(res.availableSlots).toEqual([
        {
          id: 'slot-soon',
          date: formatDateLocal(new Date('2026-10-02T14:00:00.000Z')),
          interviewerName: 'Jane',
        },
        {
          id: 'slot-later',
          date: formatDateLocal(new Date('2026-10-03T14:00:00.000Z')),
          interviewerName: 'Ravi',
        },
      ])
    })

    it('passes a missing booking through as null', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scheduledInterview: null, availableSlots: [] }),
      })

      await expect(interviewService.fetchInterviewData()).resolves.toEqual({
        scheduledInterview: null,
        availableSlots: [],
      })
    })

    it('throws when the slots cannot be loaded', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(interviewService.fetchInterviewData()).rejects.toThrow('403')
    })
  })

  describe('bookInterviewSlot', () => {
    const booked = {
      id: 'slot-1',
      date: '2026-10-02T14:00:00.000Z',
      interviewerName: 'Jane',
      meetingLink: 'https://zoom.us/1',
      interviewSlotStatus: 'pending',
    }

    it('posts only the slot id and returns the booked interview', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ interview: booked, emailSent: true }),
      })

      const interview = await interviewService.bookInterviewSlot('slot-1')

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/interview',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ slotId: 'slot-1' }),
        }),
      )
      expect(interview).toEqual({
        ...booked,
        date: formatDateLocal(new Date(booked.date)),
      })
    })

    it('logs but still resolves when the booking saved and its email did not', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ interview: booked, emailSent: false }),
      })
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await expect(
        interviewService.bookInterviewSlot('slot-1'),
      ).resolves.toMatchObject({ id: 'slot-1' })

      expect(errorSpy).toHaveBeenCalledWith(
        '[interviewService] The confirmation email for interview slot-1 was not sent.',
      )
      errorSpy.mockRestore()
    })

    it('throws the server’s message, e.g. when somebody booked the slot first', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          message:
            'The interview slot you selected is no longer available. Please select another slot.',
        }),
      })

      await expect(
        interviewService.bookInterviewSlot('slot-1'),
      ).rejects.toThrow('no longer available')
    })

    it('falls back to a generic message when the refusal has no body', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error('not json')
        },
      })

      await expect(
        interviewService.bookInterviewSlot('slot-1'),
      ).rejects.toThrow('Failed to book interview')
    })
  })

  describe('requestInterviewSlot', () => {
    it('posts the picked time to /api/slotRequest rather than writing Firestore', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await interviewService.requestInterviewSlot('2026-06-01T10:00')

      expect(firestore.setDoc).not.toHaveBeenCalled()
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/slotRequest',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('sends the picked time and the instant it means, and nothing about the applicant', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await interviewService.requestInterviewSlot('2026-06-01T10:00')

      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      // The name and uid are read server-side, the address from the session.
      expect(JSON.parse(options.body)).toEqual({
        requestedTime: '2026-06-01T10:00',
        date: new Date('2026-06-01T10:00').toISOString(),
      })
    })

    it("throws with the server's message on refusal", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: () =>
          Promise.resolve({ message: 'Please pick a time in the future.' }),
      })

      await expect(
        interviewService.requestInterviewSlot('2026-06-01T10:00'),
      ).rejects.toThrow('Please pick a time in the future.')
    })
  })
})
