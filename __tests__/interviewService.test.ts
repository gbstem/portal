import { interviewService } from '#lib/services/interviewService.js'
import { formatDateLocal } from '#lib/utils.js'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  setDoc: jest.fn(),
}))

const respond = (body: unknown, ok = true) =>
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 409,
    json: async () => body,
  })
const sent = () => {
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
  return {
    url,
    method: init?.method,
    body: init?.body === undefined ? undefined : JSON.parse(init.body),
  }
}

describe('interviewService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchInterviewData', () => {
    it('loads from /api/interview, reading times as Dates in the server’s order', async () => {
      respond({
        scheduledInterview: {
          id: 'slot-mine',
          date: '2026-10-01T14:00:00.000Z',
          interviewerName: 'Jane',
          meetingLink: 'https://zoom.us/1',
          interviewSlotStatus: 'pending',
        },
        availableTimes: [
          '2026-10-02T14:00:00.000Z',
          '2026-10-03T14:00:00.000Z',
        ],
        interviewWindow: {
          opens: '2026-09-01T04:00:00.000Z',
          closes: '2026-09-20T04:00:00.000Z',
        },
        availability: {
          times: ['2026-10-04T14:00:00.000Z'],
          updated: '2026-09-28T12:00:00.000Z',
        },
      })

      const result = await interviewService.fetchInterviewData()

      expect(sent().url).toBe('/api/interview')
      expect(result.scheduledInterview).toEqual({
        id: 'slot-mine',
        at: new Date('2026-10-01T14:00:00.000Z'),
        date: formatDateLocal(new Date('2026-10-01T14:00:00.000Z')),
        interviewerName: 'Jane',
        meetingLink: 'https://zoom.us/1',
        interviewSlotStatus: 'pending',
      })
      expect(result.availableTimes).toEqual([
        new Date('2026-10-02T14:00:00.000Z'),
        new Date('2026-10-03T14:00:00.000Z'),
      ])
      expect(result.interviewWindow.closes).toEqual(
        new Date('2026-09-20T04:00:00.000Z'),
      )
      expect(result.availability).toEqual({
        times: [new Date('2026-10-04T14:00:00.000Z')],
        updated: new Date('2026-09-28T12:00:00.000Z'),
      })
    })

    it('reads no booking and no availability as null', async () => {
      respond({
        scheduledInterview: null,
        availableTimes: [],
        interviewWindow: {
          opens: '2026-09-01T04:00:00.000Z',
          closes: '2026-09-20T04:00:00.000Z',
        },
        availability: null,
      })

      await expect(
        interviewService.fetchInterviewData(),
      ).resolves.toMatchObject({
        scheduledInterview: null,
        availableTimes: [],
        availability: null,
      })
    })

    it('throws when the server refuses', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(interviewService.fetchInterviewData()).rejects.toThrow('403')
    })
  })

  describe('bookInterview', () => {
    const booked = {
      id: 'slot-1',
      date: '2026-10-02T14:00:00.000Z',
      interviewerName: 'Jane',
      meetingLink: 'https://zoom.us/1',
      interviewSlotStatus: 'pending',
    }
    const at = new Date('2026-10-02T14:00:00.000Z')

    it('posts only the time chosen and returns the booked interview', async () => {
      respond({ interview: booked, emailSent: true })

      const interview = await interviewService.bookInterview(at)

      expect(sent()).toEqual({
        url: '/api/interview',
        method: 'POST',
        body: { date: at.toISOString() },
      })
      expect(interview).toEqual({
        ...booked,
        at,
        date: formatDateLocal(at),
      })
    })

    it('asks to give up the current interview when rescheduling', async () => {
      respond({ interview: booked, emailSent: true })

      await interviewService.bookInterview(at, { reschedule: true })

      expect(sent().body).toEqual({ date: at.toISOString(), reschedule: true })
    })

    it('logs but still resolves when the booking saved and its email did not', async () => {
      respond({ interview: booked, emailSent: false })
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await expect(interviewService.bookInterview(at)).resolves.toMatchObject({
        id: 'slot-1',
      })
      expect(errorSpy).toHaveBeenCalledWith(
        '[interviewService] The confirmation email for interview slot-1 was not sent.',
      )
      errorSpy.mockRestore()
    })

    it('throws the server’s message, e.g. when somebody took the time first', async () => {
      respond({ message: 'That interview time is no longer available.' }, false)

      await expect(interviewService.bookInterview(at)).rejects.toThrow(
        'no longer available',
      )
    })
  })

  describe('cancelInterview', () => {
    it('deletes through /api/interview', async () => {
      respond({ emailSent: true })

      await expect(interviewService.cancelInterview()).resolves.toEqual({
        emailSent: true,
      })
      expect(sent()).toMatchObject({ url: '/api/interview', method: 'DELETE' })
    })
  })

  describe('saveAvailability', () => {
    it('puts the painted times as instants to /api/availability, not Firestore', async () => {
      const times = [new Date('2026-10-06T19:00:00.000Z')]
      respond({ times: ['2026-10-06T19:00:00.000Z'], emailSent: true })

      await expect(interviewService.saveAvailability(times)).resolves.toEqual(
        times,
      )
      expect(firestore.setDoc).not.toHaveBeenCalled()
      expect(sent()).toEqual({
        url: '/api/availability',
        method: 'PUT',
        body: { times: ['2026-10-06T19:00:00.000Z'] },
      })
    })

    it("throws with the server's message on refusal", async () => {
      respond({ message: 'You already have an interview scheduled.' }, false)

      await expect(interviewService.saveAvailability([])).rejects.toThrow(
        'You already have an interview scheduled.',
      )
    })
  })
})
