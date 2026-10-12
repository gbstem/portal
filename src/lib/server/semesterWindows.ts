import { semesterDates } from '#lib/data/collections.js'
import { gbstemMidnight } from '#lib/shared/gbstemTime.js'
import {
  interviewWindow,
  type InterviewWindow,
} from '#lib/shared/interviews.js'

/**
 * When the application, registration and interview windows open and close, as
 * the server enforces them. `semesterDates` holds calendar dates (`MM/DD/YY`); gbSTEM
 * advertises its deadlines as 11:59 PM Eastern, so a window closes at a
 * midnight in New York, whatever time zone the server runs in.
 *
 * Each due date can be replaced by an `E2E_*` variable, and only while the
 * Firestore emulator is in use: Cypress can move the browser's clock but not
 * the server's, so without one an e2e submit test could only pass while the
 * real window is open.
 */

type Env = Record<string, string | undefined>

function dueDate(env: Env, overrideName: string, real: string): string {
  return (env.FIRESTORE_EMULATOR_HOST && env[overrideName]) || real
}

/**
 * The first instant applications are closed: midnight in New York at the end
 * of the due date, which the form advertises as "due <date> at 11:59 PM ET".
 * `E2E_INSTRUCTOR_APPS_DUE` replaces the due date under the emulator.
 */
export function applicationDeadline(env: Env): Date {
  return gbstemMidnight(
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
    opens: gbstemMidnight(semesterDates.registrationsOpen, 0),
    closes: gbstemMidnight(
      dueDate(env, 'E2E_REGISTRATIONS_DUE', semesterDates.registrationsDue),
      REGISTRATION_GRACE_DAYS,
    ),
  }
}

/**
 * When applicants can book or request an interview: `interviewsStart` through
 * `interviewsEnd`, in New York time (see `interviewWindow`).
 * `E2E_INTERVIEWS_END` replaces the last day under the emulator, where the
 * seeded slots are dated from today rather than inside the real window.
 */
export function interviewSchedulingWindow(env: Env): InterviewWindow {
  return interviewWindow({
    interviewsStart: semesterDates.interviewsStart,
    interviewsEnd: dueDate(
      env,
      'E2E_INTERVIEWS_END',
      semesterDates.interviewsEnd,
    ),
  })
}
