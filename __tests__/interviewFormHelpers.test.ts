import type {} from '../src/data.d.ts'
import {
  formatInterviewWindow,
  interviewIneligibility,
  isFinalDecision,
  summarizeAvailability,
  usableAvailabilityTimes,
} from '#lib/helpers/interviewForm.js'
import { interviewWindow } from '#lib/shared/interviews.js'

describe('InterviewForm Helpers', () => {
  // Admin's helpers/setInterviewTimes has the same rule and the same cases.
  describe('isFinalDecision', () => {
    test.each([
      ['accepted', true],
      ['substitute', true],
      ['waitlisted', true],
      ['rejected', true],
      // An invitation to interview, not a decision on the applicant.
      ['interview', false],
      [null, false],
      [undefined, false],
    ] as const)('%s -> %s', (decision, expected) => {
      expect(isFinalDecision(decision)).toBe(expected)
    })
  })

  describe('interviewIneligibility', () => {
    const meta = (overrides: Record<string, unknown> = {}) => ({
      uid: 'uid-1',
      submitted: true,
      interview: false,
      decided: false,
      ...overrides,
    })

    test.each([
      ['a submitted, unscheduled, undecided applicant', meta(), null],
      [
        'one invited to interview',
        meta({ decided: true, decisionType: 'interview' }),
        null,
      ],
      // Notes or a likely decision set `decided` without deciding anything.
      ['one with only notes', meta({ decided: true }), null],
      ['no application', undefined, 'unsubmitted'],
      ['an unsubmitted one', meta({ submitted: false }), 'unsubmitted'],
      ['a scheduled one', meta({ interview: true }), 'scheduled'],
      ['a decided one', meta({ decisionType: 'rejected' }), 'decided'],
    ] as const)('%s -> %s', (_, value, expected) => {
      expect(interviewIneligibility(value as any)).toBe(expected)
    })
  })

  describe('formatInterviewWindow', () => {
    test('names the first and last days in Eastern time, in any runtime zone', () => {
      expect(
        formatInterviewWindow(
          interviewWindow({
            interviewsStart: '09/01/26',
            interviewsEnd: '09/19/26',
          }),
        ),
      ).toBe('Tue, Sep 1 – Sat, Sep 19')
    })
  })

  describe('usableAvailabilityTimes', () => {
    const window = {
      opens: new Date('2026-10-01T04:00:00.000Z'),
      closes: new Date('2026-10-20T04:00:00.000Z'),
    }
    const now = new Date('2026-10-05T12:00:00.000Z')
    const at = (iso: string) => new Date(iso)

    it('keeps times to come, in the window and on a row, soonest first, once each', () => {
      expect(
        usableAvailabilityTimes(
          [
            at('2026-10-06T19:15:00.000Z'),
            at('2026-10-06T19:00:00.000Z'),
            at('2026-10-06T19:00:00.000Z'),
          ],
          window,
          now,
        ),
      ).toEqual([
        at('2026-10-06T19:00:00.000Z'),
        at('2026-10-06T19:15:00.000Z'),
      ])
    })

    it.each([
      ['already past', '2026-10-05T11:45:00.000Z'],
      ['before the window opens', '2026-09-30T19:00:00.000Z'],
      ['once it closes', '2026-10-20T04:00:00.000Z'],
      ['off a row', '2026-10-06T19:05:00.000Z'],
      ['not a date at all', 'nonsense'],
    ])('drops a time %s', (_, iso) => {
      expect(usableAvailabilityTimes([at(iso)], window, now)).toEqual([])
    })
  })

  describe('summarizeAvailability', () => {
    it("runs back-to-back times together, by day, in gbSTEM's time", () => {
      // 6:30, 6:45 and 7:00 PM, then 4:00 PM the next day (EDT).
      const times = [
        '2026-10-05T22:30:00.000Z',
        '2026-10-05T22:45:00.000Z',
        '2026-10-05T23:00:00.000Z',
        '2026-10-06T20:00:00.000Z',
      ].map((iso) => new Date(iso))

      expect(summarizeAvailability(times)).toEqual({
        summary: '4 times between Mon, Oct 5 and Tue, Oct 6 (Eastern time)',
        times: 'Mon, Oct 5: 6:30 PM – 7:15 PM; Tue, Oct 6: 4:00 PM – 4:15 PM',
      })
    })

    it('names one day once', () => {
      expect(
        summarizeAvailability([new Date('2026-10-05T22:30:00.000Z')]).summary,
      ).toBe('1 time on Mon, Oct 5 (Eastern time)')
    })
  })
})
