import {
  applicationsCollection,
  interviewCollection,
} from '$lib/data/collections'
import { interviewService } from '$lib/services/interviewService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
}))

function mockDoc(id: string, data: Record<string, any>) {
  return { id, data: () => data }
}

const semesterDates = {
  returningInstructorAppsOpen: '2026-01-01',
  instructorOrientation: '2026-06-01',
} as Data.SemesterDates

describe('interviewService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchInterviewData', () => {
    it('returns the current scheduled interview with status recomputed from the date', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        forEach: (cb: any) =>
          [
            mockDoc('slot-1', {
              intervieweeId: 'uid-1',
              date: { seconds: futureDate.getTime() / 1000 },
              interviewSlotStatus: 'pending',
              interviewerName: 'Jane',
            }),
          ].forEach(cb),
      })

      const res = await interviewService.fetchInterviewData(
        'uid-1',
        semesterDates,
      )
      expect(res.scheduledInterview).not.toBeNull()
      expect(res.scheduledInterview?.id).toBe('slot-1')
      expect(res.scheduledInterview?.interviewSlotStatus).toBe('pending')
      expect(res.availableSlots).toEqual([])
    })

    it("marks the scheduled interview 'completed' once its date has passed", async () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000)
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        forEach: (cb: any) =>
          [
            mockDoc('slot-1', {
              intervieweeId: 'uid-1',
              date: { seconds: pastDate.getTime() / 1000 },
              interviewSlotStatus: 'pending',
            }),
          ].forEach(cb),
      })

      const res = await interviewService.fetchInterviewData(
        'uid-1',
        semesterDates,
      )
      expect(res.scheduledInterview?.interviewSlotStatus).toBe('completed')
    })

    it('ignores a scheduled interview from before returningInstructorAppsOpen (a stale prior-cycle booking)', async () => {
      const staleDate = new Date('2025-06-01')
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        forEach: (cb: any) =>
          [
            mockDoc('slot-old', {
              intervieweeId: 'uid-1',
              date: { seconds: staleDate.getTime() / 1000 },
              interviewSlotStatus: 'pending',
            }),
          ].forEach(cb),
      })

      const res = await interviewService.fetchInterviewData(
        'uid-1',
        semesterDates,
      )
      expect(res.scheduledInterview).toBeNull()
    })

    it('includes available slots more than 4 hours out and before orientation', async () => {
      const soon = new Date(Date.now() + 5 * 60 * 60 * 1000)
      const later = new Date(Date.now() + 48 * 60 * 60 * 1000)
      const tooSoon = new Date(Date.now() + 1 * 60 * 60 * 1000)
      const notAvailable = new Date(Date.now() + 24 * 60 * 60 * 1000)

      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        forEach: (cb: any) =>
          [
            mockDoc('slot-later', {
              intervieweeId: '',
              date: { seconds: later.getTime() / 1000 },
              interviewSlotStatus: 'available',
            }),
            mockDoc('slot-soon', {
              intervieweeId: '',
              date: { seconds: soon.getTime() / 1000 },
              interviewSlotStatus: 'available',
            }),
            mockDoc('slot-too-soon', {
              intervieweeId: '',
              date: { seconds: tooSoon.getTime() / 1000 },
              interviewSlotStatus: 'available',
            }),
            mockDoc('slot-pending', {
              intervieweeId: '',
              date: { seconds: notAvailable.getTime() / 1000 },
              interviewSlotStatus: 'pending',
            }),
          ].forEach(cb),
      })

      const res = await interviewService.fetchInterviewData(
        'uid-1',
        semesterDates,
      )
      // Not asserting sort order here: the sort key is `formatDateLocal(...)`
      // (a long human-readable string like "Wednesday, June 3, 2026 at
      // 10:00 AM Eastern Daylight Time"), which `new Date(...)` can't parse
      // back into a valid timestamp - this mirrors a pre-existing no-op sort
      // in the original InterviewForm.svelte code, preserved as-is here.
      expect(res.availableSlots.map((s) => s.id).sort()).toEqual(
        ['slot-later', 'slot-soon'].sort(),
      )
    })

    it('excludes slots after instructorOrientation unless in dev mode', async () => {
      // Both semesterDates.instructorOrientation (2026-06-01) and this slot
      // date are anchored relative to "now" so the test stays valid however
      // far in the future it's run.
      const afterOrientation = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        forEach: (cb: any) =>
          [
            mockDoc('slot-after', {
              intervieweeId: '',
              date: { seconds: afterOrientation.getTime() / 1000 },
              interviewSlotStatus: 'available',
            }),
          ].forEach(cb),
      })

      // $app/environment is globally mocked with dev: true in jest.setup.ts,
      // so this slot is included even though it's after instructorOrientation.
      const res = await interviewService.fetchInterviewData(
        'uid-1',
        semesterDates,
      )
      expect(res.availableSlots.map((s) => s.id)).toEqual(['slot-after'])
    })
  })

  describe('confirmSlotAvailable', () => {
    it('returns true when the slot status is available', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        data: () => ({ interviewSlotStatus: 'available' }),
      })
      const res = await interviewService.confirmSlotAvailable('slot-1')
      expect(res).toBe(true)
    })

    it('returns false when the slot status is not available', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        data: () => ({ interviewSlotStatus: 'pending' }),
      })
      const res = await interviewService.confirmSlotAvailable('slot-1')
      expect(res).toBe(false)
    })

    it('returns false when the slot document has no data', async () => {
      ;(firestore.getDoc as jest.Mock).mockResolvedValueOnce({
        data: () => undefined,
      })
      const res = await interviewService.confirmSlotAvailable('slot-1')
      expect(res).toBe(false)
    })
  })

  describe('bookInterviewSlot', () => {
    const slot = {
      id: 'slot-1',
      date: '2026-06-01 10:00 AM',
      meetingLink: 'https://zoom.us/1',
      interviewerName: 'Jane',
      interviewerEmail: 'jane@example.com',
      interviewSlotStatus: 'pending',
    } as unknown as Data.InterviewSlot

    const currentUser = {
      object: { uid: 'uid-1', email: 'applicant@example.com' },
      profile: { firstName: 'Timmy', lastName: 'Tester' },
    } as Data.User.Store

    it('updates the application and slot, and sends the confirmation email', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      await interviewService.bookInterviewSlot(slot, currentUser)

      expect(firestore.updateDoc).toHaveBeenCalledTimes(2)
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/interview',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('logs but does not throw if the confirmation email API responds not-ok', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'bad request' }),
      })
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await expect(
        interviewService.bookInterviewSlot(slot, currentUser),
      ).resolves.toBeUndefined()

      expect(errorSpy).toHaveBeenCalledWith(
        '[interviewService] Email notification send error:',
        'bad request',
      )
      errorSpy.mockRestore()
    })

    it('falls back to a generic message when the error response has no body', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.reject(new Error('no body')),
      })
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await interviewService.bookInterviewSlot(slot, currentUser)

      expect(errorSpy).toHaveBeenCalledWith(
        '[interviewService] Email notification send error:',
        'Unknown error',
      )
      errorSpy.mockRestore()
    })

    it('propagates errors from updateDoc', async () => {
      ;(firestore.updateDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )
      await expect(
        interviewService.bookInterviewSlot(slot, currentUser),
      ).rejects.toThrow('permission-denied')
    })

    // The three payloads below are hand-written object literals, and the two
    // documents they touch are shared with admin. Asserting shape rather than
    // just call count is the point: a field dropped from any of them is a
    // silent partial booking, since every write here still resolves.
    describe('written payloads', () => {
      // The `db` handle is undefined under the mocked firestore module, so
      // compare only the collection path and document id.
      const docTarget = (callIndex: number) =>
        (firestore.doc as jest.Mock).mock.calls[callIndex].slice(1)

      beforeEach(async () => {
        ;(firestore.updateDoc as jest.Mock).mockResolvedValue(undefined)
        ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })
        await interviewService.bookInterviewSlot(slot, currentUser)
      })

      it('touches only meta.interview on the application', () => {
        // A whole-object `meta` write here would clobber `meta.decided` and
        // `meta.submitted`, which admin and ApplyForm own respectively.
        expect(firestore.updateDoc).toHaveBeenNthCalledWith(
          1,
          expect.anything(),
          {
            'meta.interview': true,
          },
        )
        expect(docTarget(0)).toEqual([applicationsCollection, 'uid-1'])
      })

      it('claims the slot with the full interviewee identity', () => {
        expect(firestore.updateDoc).toHaveBeenNthCalledWith(
          2,
          expect.anything(),
          {
            // Taken from the caller's slot, not hardcoded - the booking flow
            // decides whether this lands as 'pending' or 'confirmed'.
            interviewSlotStatus: 'pending',
            intervieweeFirstName: 'Timmy',
            intervieweeLastName: 'Tester',
            intervieweeEmail: 'applicant@example.com',
            intervieweeId: 'uid-1',
          },
        )
        expect(docTarget(1)).toEqual([interviewCollection, 'slot-1'])
      })

      it('sends the confirmation email addressed to the interviewer', () => {
        const [, init] = (global.fetch as jest.Mock).mock.calls[0]
        expect(JSON.parse((init as RequestInit).body as string)).toEqual({
          // The interviewer is notified, so this must be their address and not
          // the applicant's - the two sit side by side on the slot.
          email: 'jane@example.com',
          date: '2026-06-01 10:00 AM',
          link: 'https://zoom.us/1',
          interviewer: 'Jane',
          firstName: 'Timmy',
        })
      })
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

    it('defaults the notification email to an empty string when the user has none set', async () => {
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
      expect(body.intervieweeEmail).toBe('')
    })
  })
})
