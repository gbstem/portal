import type {} from '../../data.d.ts'

/**
 * Validates a time a candidate has asked us to add as an interview slot.
 *
 * Returns the message to show them, or `null` if the time is acceptable.
 *
 * The lower bound exists because there was none: the only date check used to be
 * the closing deadline below, so any past time passed. That mattered because the
 * request field defaulted to a hardcoded `'2024-09-20T12:00'` -- a candidate who
 * submitted without editing it filed a request two years stale, got the success
 * toast, and was never seen, since the admin request list only renders requests
 * that are upcoming or less than 30 days old.
 *
 * `now` is injectable so this is testable without freezing the clock.
 */
export function validateRequestedInterviewTime(
  dateToAdd: string,
  interviewsCloseOn: string,
  now: Date = new Date(),
): string | null {
  const requested = new Date(dateToAdd)

  if (Number.isNaN(requested.getTime())) {
    return 'Please select a date and time.'
  }
  if (requested.getTime() <= now.getTime()) {
    return 'Please pick a time in the future.'
  }
  if (requested > new Date(interviewsCloseOn)) {
    return `Instructor interviews close on ${interviewsCloseOn}. Please pick a time before then.`
  }
  return null
}
