import type {} from '../../data.d.ts'
import { GBSTEM_TIME_ZONE } from '#lib/shared/gbstemTime.js'
import {
  INTERVIEW_DURATION_MINUTES,
  isWithinInterviewWindow,
  type InterviewWindow,
} from '#lib/shared/interviews.js'

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
 * Why the applicant behind `meta` can't book an interview or paint their
 * availability, or null when they need one: submitted, with no interview
 * held or booked (a missed one doesn't count - see `meta.interview`), and not
 * yet decided.
 *
 * The same rule as admin's interviewIneligibility
 * (#lib/helpers/setInterviewTimes), which decides who admins can schedule and
 * whose availability they see. Change both together.
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
 * The days of `window` in gbSTEM's time zone, e.g. "Tue, Sep 1 – Sat, Sep 19".
 */
export function formatInterviewWindow({ opens, closes }: InterviewWindow) {
  const day = (date: Date) =>
    date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: GBSTEM_TIME_ZONE,
    })
  // `closes` is the midnight after the last day.
  return `${day(opens)} – ${day(new Date(closes.getTime() - 1))}`
}

const ROW_MS = INTERVIEW_DURATION_MINUTES * 60_000

/**
 * The times worth keeping from a candidate's painted availability, soonest
 * first and each once: still to come, inside `window`, and starting on a row
 * of the grid. Every time zone's offset is a whole number of quarter hours,
 * so a row in any viewer's zone starts on a UTC quarter hour too.
 *
 * The grid only offers such times; this is the check, since what a browser
 * sends is a convenience anyone can skip, and /api/availability applies it.
 */
export function usableAvailabilityTimes(
  times: Date[],
  window: InterviewWindow,
  now: Date = new Date(),
): Date[] {
  const kept = new Map<number, Date>()
  for (const time of times) {
    const ms = time.getTime()
    if (
      Number.isFinite(ms) &&
      ms % ROW_MS === 0 &&
      time > now &&
      isWithinInterviewWindow(time, window)
    ) {
      kept.set(ms, time)
    }
  }
  return [...kept.values()].sort((a, b) => a.getTime() - b.getTime())
}

/** How a candidate's painted availability reads in the admins' email. */
export interface AvailabilitySummary {
  /** "6 times between Mon, Mar 2 and Tue, Mar 3 (Eastern time)". */
  summary: string
  /** Each day's runs of times: "Mon, Mar 2: 6:30 – 7:15 PM; Tue, Mar 3: ...". */
  times: string
}

/**
 * Summarizes `times` (soonest first, as usableAvailabilityTimes returns them)
 * in gbSTEM's time zone, where admins read them. Back-to-back times run
 * together, from the first start to the last one's end.
 */
export function summarizeAvailability(times: Date[]): AvailabilitySummary {
  const day = (date: Date) =>
    date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: GBSTEM_TIME_ZONE,
    })
  const clock = (date: Date) =>
    date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: GBSTEM_TIME_ZONE,
    })

  const days = new Map<string, { start: Date; end: Date }[]>()
  for (const time of times) {
    const runs = days.get(day(time)) ?? []
    const last = runs.at(-1)
    const end = new Date(time.getTime() + ROW_MS)
    if (last && last.end.getTime() === time.getTime()) last.end = end
    else runs.push({ start: time, end })
    days.set(day(time), runs)
  }

  const count = `${times.length} time${times.length === 1 ? '' : 's'}`
  const span =
    times.length === 0
      ? ''
      : day(times[0]) === day(times.at(-1)!)
        ? ` on ${day(times[0])}`
        : ` between ${day(times[0])} and ${day(times.at(-1)!)}`
  return {
    summary: `${count}${span} (Eastern time)`,
    times: [...days]
      .map(
        ([label, runs]) =>
          `${label}: ${runs.map(({ start, end }) => `${clock(start)} – ${clock(end)}`).join(', ')}`,
      )
      .join('; '),
  }
}
