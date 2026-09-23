import type {} from '../src/data.d.ts'
import { validateRequestedInterviewTime } from '$lib/helpers/interviewForm'

describe('InterviewForm Helpers', () => {
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
