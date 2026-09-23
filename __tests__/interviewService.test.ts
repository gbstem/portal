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
    const currentUser = {
      object: { uid: 'uid-1', email: 'applicant@example.com' },
      profile: { firstName: 'Timmy', lastName: 'Tester' },
    } as Data.User.Store

    it('saves the requested timeslot and notifies via email', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await interviewService.requestInterviewSlot(
        '2026-06-01T10:00',
        currentUser,
      )

      expect(firestore.setDoc).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/slotRequest',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('logs but does not throw if the slot request email API responds not-ok', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'bad request' }),
      })
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await expect(
        interviewService.requestInterviewSlot('2026-06-01T10:00', currentUser),
      ).resolves.toBeUndefined()

      expect(errorSpy).toHaveBeenCalledWith(
        'Interview slot request failed:',
        'bad request',
      )
      errorSpy.mockRestore()
    })

    it('propagates errors from setDoc', async () => {
      ;(firestore.setDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )
      await expect(
        interviewService.requestInterviewSlot('2026-06-01T10:00', currentUser),
      ).rejects.toThrow('permission-denied')
    })

    it('sends no address at all - the handler uses the verified session email', async () => {
      ;(firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      const userWithoutEmail = {
        object: { uid: 'uid-1', email: null },
        profile: { firstName: 'Timmy', lastName: 'Tester' },
      } as unknown as Data.User.Store

      await interviewService.requestInterviewSlot(
        '2026-06-01T10:00',
        userWithoutEmail,
      )

      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body).not.toHaveProperty('intervieweeEmail')
      expect(body).toEqual({
        firstName: 'Timmy',
        timeSlot: expect.any(String),
      })
    })
  })
})
