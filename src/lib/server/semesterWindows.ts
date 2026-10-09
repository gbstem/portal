import { semesterDates } from '#lib/data/collections.js'

/**
 * When the application and registration windows open and close, as the server
 * enforces them. `semesterDates` holds calendar dates (`MM/DD/YY`); gbSTEM
 * advertises its deadlines as 11:59 PM Eastern, so a window closes at a
 * midnight in New York, whatever time zone the server runs in.
 *
 * Each due date can be replaced by an `E2E_*` variable, and only while the
 * Firestore emulator is in use: Cypress can move the browser's clock but not
 * the server's, so without one an e2e submit test could only pass while the
 * real window is open.
 */

type Env = Record<string, string | undefined>

/** The UTC offset of New York at `at`, in minutes (e.g. -240 during EDT). */
function newYorkOffsetMinutes(at: Date): number {
  const name =
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
    })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-5'
  const match = /GMT([+-]\d+)(?::(\d+))?/.exec(name)
  if (!match) return -300
  const hours = Number(match[1])
  const minutes = Number(match[2] ?? 0)
  return hours * 60 + Math.sign(hours) * minutes
}

/**
 * Midnight in New York at the start of the day `daysAfter` days after the
 * calendar date `date`.
 */
function newYorkMidnight(date: string, daysAfter: number): Date {
  const day = new Date(date)
  const midnightUtc = new Date(
    Date.UTC(day.getFullYear(), day.getMonth(), day.getDate() + daysAfter),
  )
  return new Date(
    midnightUtc.getTime() - newYorkOffsetMinutes(midnightUtc) * 60_000,
  )
}

function dueDate(env: Env, overrideName: string, real: string): string {
  return (env.FIRESTORE_EMULATOR_HOST && env[overrideName]) || real
}

/**
 * The first instant applications are closed: midnight in New York at the end
 * of the due date, which the form advertises as "due <date> at 11:59 PM ET".
 * `E2E_INSTRUCTOR_APPS_DUE` replaces the due date under the emulator.
 */
export function applicationDeadline(env: Env): Date {
  return newYorkMidnight(
    dueDate(env, 'E2E_INSTRUCTOR_APPS_DUE', semesterDates.newInstructorAppsDue),
    1,
  )
}

/**
 * How many days after `registrationsDue` a registration can still be
 * submitted. The form has always kept registrations open for a week past the
 * date it advertises - its "deadline passed" banner compared against
 * `registrationsDue` plus seven days - and moving the check to the server kept
 * that rather than quietly shortening the window. Whether the grace week is
 * still wanted is a question for gbSTEM leadership.
 */
export const REGISTRATION_GRACE_DAYS = 7

/**
 * When registrations open (midnight in New York starting `registrationsOpen`)
 * and the first instant they are closed (the start of the day
 * `REGISTRATION_GRACE_DAYS` after `registrationsDue`).
 * `E2E_REGISTRATIONS_DUE` replaces the due date under the emulator.
 */
export function registrationWindow(env: Env): { opens: Date; closes: Date } {
  return {
    opens: newYorkMidnight(semesterDates.registrationsOpen, 0),
    closes: newYorkMidnight(
      dueDate(env, 'E2E_REGISTRATIONS_DUE', semesterDates.registrationsDue),
      REGISTRATION_GRACE_DAYS,
    ),
  }
}
