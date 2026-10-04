import type {} from '../../data.d.ts'

type ApplicationMeta = Partial<Data.Application['meta']>

/**
 * Whether `decision` settles an application: any official decision except
 * `interview`, which only invites the applicant to schedule one.
 */
export function isFinalDecision(
  decision: Data.Decision | null | undefined,
): boolean {
  return Boolean(decision) && decision !== 'interview'
}

/** Why an applicant can't be given an interview right now. */
export type InterviewIneligibility = 'unsubmitted' | 'scheduled' | 'decided'

/**
 * Why the applicant behind `meta` can't book or request an interview, or null
 * when they need one: submitted, with no interview held or booked (a missed
 * one doesn't count - see `meta.interview`), and not yet decided.
 *
 * The same rule as admin's interviewIneligibility
 * ($lib/helpers/setInterviewTimes), which decides who admins can schedule and
 * whose time requests they see. Change both together.
 */
export function interviewIneligibility(
  meta: ApplicationMeta | undefined,
): InterviewIneligibility | null {
  if (!meta?.submitted) return 'unsubmitted'
  if (meta.interview) return 'scheduled'
  if (isFinalDecision(meta.decisionType)) return 'decided'
  return null
}

/** What an applicant is told when interviewIneligibility refuses them. */
export const interviewIneligibilityMessages: Record<
  InterviewIneligibility,
  string
> = {
  unsubmitted: 'Submit your application before scheduling an interview.',
  scheduled: 'You already have an interview scheduled.',
  decided: 'A decision has already been made on your application.',
}

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
