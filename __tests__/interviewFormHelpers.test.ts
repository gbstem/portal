import type {} from '../src/data.d.ts'
import {
  interviewIneligibility,
  isFinalDecision,
  validateRequestedInterviewTime,
} from '#lib/helpers/interviewForm.js'

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

  describe('validateRequestedInterviewTime', () => {
    const closesOn = '09/20/26'
    const now = new Date('2026-09-02T12:00:00')

    test('accepts a time between now and the closing date', () => {
      expect(
        validateRequestedInterviewTime('2026-09-10T15:00', closesOn, now),
      ).toBeNull()
    })

    // The regression this helper exists for: the request field used to default
    // to a hardcoded '2024-09-20T12:00', which passed every check there was.
    test('rejects the stale hardcoded default that used to pre-fill the field', () => {
      expect(
        validateRequestedInterviewTime('2024-09-20T12:00', closesOn, now),
      ).toBe('Please pick a time in the future.')
    })

    test('rejects a time in the past', () => {
      expect(
        validateRequestedInterviewTime('2026-09-01T09:00', closesOn, now),
      ).toBe('Please pick a time in the future.')
    })

    test('rejects a time that has only just passed', () => {
      expect(
        validateRequestedInterviewTime('2026-09-02T11:59', closesOn, now),
      ).toBe('Please pick a time in the future.')
    })

    test('rejects the present instant, since a slot needs lead time', () => {
      expect(
        validateRequestedInterviewTime('2026-09-02T12:00', closesOn, now),
      ).toBe('Please pick a time in the future.')
    })

    test('accepts a time one minute from now', () => {
      expect(
        validateRequestedInterviewTime('2026-09-02T12:01', closesOn, now),
      ).toBeNull()
    })

    test('rejects a time after interviews close, naming the date', () => {
      expect(
        validateRequestedInterviewTime('2026-10-01T15:00', closesOn, now),
      ).toBe(
        'Instructor interviews close on 09/20/26. Please pick a time before then.',
      )
    })

    test('rejects an unparseable date rather than passing it through to Firestore', () => {
      expect(validateRequestedInterviewTime('', closesOn, now)).toBe(
        'Please select a date and time.',
      )
      expect(validateRequestedInterviewTime('not a date', closesOn, now)).toBe(
        'Please select a date and time.',
      )
    })

    // Past-ness is checked before the deadline, so a stale date reads as stale
    // rather than as being after a deadline it in fact precedes.
    test('reports a past date as past even when it also precedes the deadline', () => {
      expect(
        validateRequestedInterviewTime('2024-01-01T12:00', closesOn, now),
      ).toBe('Please pick a time in the future.')
    })

    test('defaults `now` to the current clock when not supplied', () => {
      expect(
        validateRequestedInterviewTime('2020-01-01T12:00', '01/01/99'),
      ).toBe('Please pick a time in the future.')
    })
  })
})
